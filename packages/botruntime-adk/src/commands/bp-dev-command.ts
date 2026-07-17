import { execa, type ResultPromise } from 'execa'
import treeKill from 'tree-kill'
import { join } from 'path'
import { access } from 'fs/promises'
import { getBpCli, getBpCliEnvironment } from './bp-cli.js'
import { BaseCommand } from './base-command.js'
import { classifyFatalStderr } from './bp-dev-stderr.js'
import { getWorkerNodeOptions, shouldPassSourceMapFlag } from './bp-dev-worker-env.js'
import { optimizeSourceMap } from '../utils/source-map-optimizer.js'

export interface BpDevCommandOptions {
  port: string
  botPath: string
  agentPath: string
  workspaceId: string
  credentials: {
    token: string
    apiUrl: string
  }
  /** The dev bot ID if already known (from agent.local.json) */
  devBotId?: string
  sourceMap?: boolean
  /** When `false`, pass `--no-watch` to `bp dev`. Requires @holocronlab/brt >= 0.2.0. */
  watch?: boolean
  /** Bot configuration to inject as environment variable */
  configuration?: Record<string, unknown>
  /** Secret values to inject as SECRET_* environment variables */
  secrets?: Record<string, string>
  /** Auto-negotiated port for the internal CLI span ingest server (HttpSpanExporter) */
  spanIngestPort: number
  /** Port for standard OTLP export to external tools (default 4318) */
  otlpPort?: number
  /** Bot name from agent.config.ts, used for OTLP service.name */
  botName?: string
}

export type BpDevProgressEvent =
  | {
      type: 'generating'
      startTime: number
      endTime?: number
    }
  | {
      type: 'bundling'
      startTime: number
      endTime?: number
      data?: {
        buildTime: number
      }
    }
  | {
      type: 'deploying'
      startTime: number
      endTime?: number
      data?: {
        botId: string
        tunnelUrl: string
      }
    }
  | {
      type: 'listening'
      startTime: number
      data: {
        port: number
      }
    }

export class BpDevCommand extends BaseCommand<BpDevProgressEvent> {
  private childProcess: ResultPromise | null = null
  private killed = false
  private stderrLines: string[] = []
  private readonly MAX_STDERR_LINES = 50

  // Track progress events
  private progressEvents: Map<BpDevProgressEvent['type'], BpDevProgressEvent> = new Map()

  constructor(private options: BpDevCommandOptions) {
    super()
  }

  async run(): Promise<void> {
    const { port, botPath, workspaceId, credentials, sourceMap = true } = this.options

    // Get bp command path
    const { path: bpCommand } = getBpCli()

    const bpArgs = [
      'dev',
      '-y',
      '--port',
      port,
      '--token',
      credentials.token,
      '--workspaceId',
      workspaceId,
      '--apiUrl',
      credentials.apiUrl,
    ]

    if (shouldPassSourceMapFlag(sourceMap)) {
      bpArgs.push('--sourceMap')
    }

    // Propagate `brt dev --no-watch` down to `bp dev` (default leaves it watching).
    if (this.options.watch === false) {
      bpArgs.push('--no-watch')
    }

    // Pass secret values via --secrets flags so bp dev doesn't prompt
    if (this.options.secrets) {
      for (const [key, value] of Object.entries(this.options.secrets)) {
        bpArgs.push('--secrets', `${key}=${value}`)
      }
    }

    const spanIngestUrl = `http://localhost:${this.options.spanIngestPort}`
    const otlpEndpoint = this.options.otlpPort ? `http://localhost:${this.options.otlpPort}` : undefined

    const traceLines = [`Trace endpoints:`, `  ADK_SPAN_INGEST_URL=${spanIngestUrl}`]
    if (otlpEndpoint) {
      traceLines.push(`  OTEL_EXPORTER_OTLP_ENDPOINT=${otlpEndpoint}`)
    }
    this.emit('stdout', traceLines.join('\n') + '\n')

    this.childProcess = execa(bpCommand, bpArgs, {
      cwd: botPath,
      env: getBpCliEnvironment({
        TRACE_DIR: join(botPath, 'traces'),
        // Child process defaults to 'development' so the runtime initializes trace writers
        // (Environment.isDevelopment() gates span processor creation in tracing.ts).
        // The React 19 dev mode memory leak fix (NODE_ENV=production) is applied in the
        // parent CLI process only (cli.ts / adk-dev.tsx), not here.
        NODE_ENV: process.env.ADK_DEV_WORKER_NODE_ENV || 'development',

        // force using "node" for LLMz engine
        // remove this when LLMz supports wasm (quickjs)
        VM_DRIVER: process.env.ADK_DEV_WORKER_VM_DRIVER || 'node',

        // in dev mode, we provide the user's PAT so the agent can access
        // restricted resources like adding new integrations
        ADK_LOCAL_PAT: credentials.token,

        // ADK runtime environment variables for client initialization
        ADK_TOKEN: credentials.token,
        ADK_API_URL: credentials.apiUrl,
        ADK_BOT_ID: this.options.devBotId || '',
        ADK_WORKSPACE_ID: workspaceId,

        // Inject secrets as SECRET_* environment variables
        ...Object.fromEntries(
          Object.entries(this.options.secrets ?? {}).map(([key, value]) => [`SECRET_${key}`, value])
        ),

        WORKER_MODE: 'true',
        WORKER_LIFETIME_MS: process.env.WORKER_LIFETIME_MS || '120000', // Default 2 minutes
        // Autoscaling bounds (forwarded only if set): ADK_DEV_WORKER_POOL_SIZE = ceiling (default 10),
        // ADK_DEV_WORKER_MIN_SIZE = warm floor (default 2). Defaults live in worker_pool.ts.
        ...(process.env.ADK_DEV_WORKER_POOL_SIZE !== undefined && {
          ADK_DEV_WORKER_POOL_SIZE: process.env.ADK_DEV_WORKER_POOL_SIZE,
        }),
        ...(process.env.ADK_DEV_WORKER_MIN_SIZE !== undefined && {
          ADK_DEV_WORKER_MIN_SIZE: process.env.ADK_DEV_WORKER_MIN_SIZE,
        }),

        // Internal span ingest endpoint for HttpSpanExporter (runtime → CLI trace ingestion)
        ADK_SPAN_INGEST_URL: spanIngestUrl,

        // Standard OTLP endpoint for external tools (Jaeger, otel-tui, etc.)
        ...(otlpEndpoint && { OTEL_EXPORTER_OTLP_ENDPOINT: otlpEndpoint }),

        ...(this.options.botName && { ADK_BOT_NAME: this.options.botName }),
        ADK_DIRECTORY: join(botPath, '..'),
        AGENT_DIRECTORY: this.options.agentPath,
        // Keep generated source maps available without asking Node to parse them in every worker by default.
        NODE_OPTIONS: getWorkerNodeOptions(),
      }),
      extendEnv: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // Capture stdout
    if (this.childProcess.stdout) {
      this.childProcess.stdout.on('data', (data: Buffer) => {
        const text = data.toString()
        if (text.includes('"worker_stats"')) {
          // Some chunks can contain both worker_stats and normal logs.
          // Parse only non-worker_stats lines to preserve progress events.
          const nonWorkerStatsText = text
            .split('\n')
            .filter((line) => !line.includes('"type":"worker_stats"') && !line.includes('"type": "worker_stats"'))
            .join('\n')

          if (nonWorkerStatsText.trim()) {
            this.parseOutput(nonWorkerStatsText)
          }
        } else {
          this.parseOutput(text)
        }
        this.emit('stdout', text)
      })
    }

    // Capture stderr
    if (this.childProcess.stderr) {
      this.childProcess.stderr.on('data', (data: Buffer) => {
        const text = data.toString()

        // Track stderr lines separately (keep last N lines)
        const newLines = text.split('\n').filter((line) => line.trim())
        this.stderrLines.push(...newLines)
        if (this.stderrLines.length > this.MAX_STDERR_LINES) {
          this.stderrLines = this.stderrLines.slice(-this.MAX_STDERR_LINES)
        }

        // Check for fatal errors in stderr
        const fatalError = classifyFatalStderr(text, port)

        // If we detected a fatal error, emit it and kill the process
        if (fatalError) {
          const errorObj = {
            exitCode: 1,
            stderr: this.stderrLines.join('\n'),
            message: fatalError,
          }
          this.emit('error', errorObj)

          // Kill via this.kill() — it sets `this.killed` (so the execa rejection
          // callback below knows this exit is self-initiated and doesn't emit a
          // second 'error') and tree-kills the workers, not just the direct child.
          this.kill('SIGTERM')
        }

        // Parse stderr as well (some status messages might be there)
        this.parseOutput(text)
        this.emit('stderr', text)
      })
    }

    // Handle process exit
    this.childProcess.then(
      () => {
        // Process exited normally
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- child process error callback
      (error: any) => {
        if (this.killed) {
          return
        }

        // Build error message with stderr
        let errorMessage = error.message || 'Process exited with error'
        if (this.stderrLines.length > 0) {
          errorMessage += `\n\nLast ${this.stderrLines.length} lines of stderr:\n${this.stderrLines.join('\n')}`
        }

        const errorObj = {
          exitCode: error.exitCode ?? 1,
          stderr: this.stderrLines.join('\n'),
          message: errorMessage,
        }

        this.emit('error', errorObj)
      }
    )
  }

  private parseOutput(text: string): void {
    const now = Date.now()
    const lowerText = text.toLowerCase()

    // Parse status changes and emit progress events
    if (lowerText.includes('generating') && lowerText.includes('typing')) {
      const event: BpDevProgressEvent = {
        type: 'generating',
        startTime: now,
      }
      this.progressEvents.set('generating', event)
      this.emit('progress', event)
    } else if (lowerText.includes('bundling') && lowerText.includes('bot')) {
      // End generating phase
      const generatingEvent = this.progressEvents.get('generating')
      if (generatingEvent && generatingEvent.type === 'generating' && !generatingEvent.endTime) {
        const updatedEvent: BpDevProgressEvent = {
          ...generatingEvent,
          endTime: now,
        }
        this.progressEvents.set('generating', updatedEvent)
        this.emit('progress', updatedEvent)
      }

      // Start bundling phase
      const event: BpDevProgressEvent = {
        type: 'bundling',
        startTime: now,
      }
      this.progressEvents.set('bundling', event)
      this.emit('progress', event)
    } else if (lowerText.includes('deploying') && lowerText.includes('dev')) {
      // End bundling phase
      const bundlingEvent = this.progressEvents.get('bundling')
      if (bundlingEvent && bundlingEvent.type === 'bundling' && !bundlingEvent.endTime) {
        const updatedEvent: BpDevProgressEvent = {
          ...bundlingEvent,
          endTime: now,
        }
        this.progressEvents.set('bundling', updatedEvent)
        this.emit('progress', updatedEvent)
      }

      // Start deploying phase
      const event: BpDevProgressEvent = {
        type: 'deploying',
        startTime: now,
      }
      this.progressEvents.set('deploying', event)
      this.emit('progress', event)
    }

    // Parse build time
    const buildTimeMatch = text.match(/build\s+completed\s+in\s+(\d+)\s*ms/i)
    if (buildTimeMatch && buildTimeMatch[1]) {
      const bundlingEvent = this.progressEvents.get('bundling')
      if (bundlingEvent && bundlingEvent.type === 'bundling') {
        const updatedEvent: BpDevProgressEvent = {
          ...bundlingEvent,
          data: {
            buildTime: parseInt(buildTimeMatch[1], 10),
          },
        }
        this.progressEvents.set('bundling', updatedEvent)
        this.emit('progress', updatedEvent)
      }
    }

    // Parse bot deployment info
    const deployMatch = text.match(
      /dev\s+bot\s+deployed\s+with\s+id\s+["']?([a-f0-9-]+)["']?\s+at\s+["']?(https?:\/\/[^\s"']+)["']?/i
    )
    if (deployMatch && deployMatch[1] && deployMatch[2]) {
      // End deploying phase
      const deployingEvent = this.progressEvents.get('deploying')
      if (deployingEvent && deployingEvent.type === 'deploying' && !deployingEvent.endTime) {
        const updatedEvent: BpDevProgressEvent = {
          ...deployingEvent,
          endTime: now,
          data: {
            botId: deployMatch[1],
            tunnelUrl: deployMatch[2],
          },
        }
        this.progressEvents.set('deploying', updatedEvent)
        this.emit('progress', updatedEvent)
      }
    }

    // Parse listening status
    const listeningMatch = text.match(/listening\s+on\s+port\s+(\d+)/i)
    if (listeningMatch && listeningMatch[1]) {
      const port = parseInt(listeningMatch[1], 10)
      const event: BpDevProgressEvent = {
        type: 'listening',
        startTime: now,
        data: {
          port,
        },
      }
      this.progressEvents.set('listening', event)
      this.emit('progress', event)

      // Optimize source map after dev server is listening
      this.optimizeSourceMapIfExists().catch(() => {
        // Silently ignore source map optimization errors
      })
    }
  }

  private async optimizeSourceMapIfExists(): Promise<void> {
    const { botPath } = this.options
    const sourceMapPath = join(botPath, '.botpress', 'dist', 'index.cjs.map')

    try {
      // Check if source map exists
      await access(sourceMapPath)

      // Get the agent's src directory (parent of botPath)
      const agentSrcPath = join(botPath, '..', '..', 'src')

      // Optimize the source map
      await optimizeSourceMap({
        sourceMapPath,
        agentSrcPath,
      })
    } catch {
      // Source map doesn't exist or optimization failed - not critical
    }
  }

  /**
   * The PID of the spawned `bp dev` child process, or null if not yet started.
   * Exposes the child PID to embedding callers and process supervisors.
   */
  get pid(): number | null {
    return this.childProcess?.pid ?? null
  }

  /**
   * Signal the entire `bp dev` process tree (parent + worker subprocesses).
   *
   * SIGTERM on the direct child alone leaves worker grandchildren holding
   * the dev server port, causing EADDRINUSE on respawn. `tree-kill` walks
   * the process tree via `pgrep` / `taskkill /T` for cross-platform reach.
   */
  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    this.killed = true
    const pid = this.childProcess?.pid
    if (!pid) return
    treeKill(pid, signal, (err) => {
      if (err) {
        this.emit('stderr', `tree-kill ${signal} failed for pid ${pid}: ${err.message}\n`)
      }
    })
  }

  /**
   * Kill the full process tree and wait until the child is reaped.
   *
   * Escalates to SIGKILL if the tree doesn't exit within 2s, so a stuck
   * worker can't block the respawn. Callers can spawn a new instance on
   * the same port immediately after this resolves.
   */
  async waitForExit(): Promise<void> {
    if (!this.childProcess) {
      return
    }
    this.kill('SIGTERM')
    const forceKill = setTimeout(() => this.kill('SIGKILL'), 2000)

    this.childProcess.stdout?.destroy()
    this.childProcess.stderr?.destroy()

    try {
      await this.childProcess
    } catch {
      // Process was killed — expected rejection from execa
    } finally {
      clearTimeout(forceKill)
    }
  }

  async restart(): Promise<BpDevCommand> {
    await this.waitForExit()
    const newCommand = new BpDevCommand(this.options)
    await newCommand.run()
    return newCommand
  }

  getProgressEvent(type: BpDevProgressEvent['type']): BpDevProgressEvent | undefined {
    return this.progressEvents.get(type)
  }

  getAllProgressEvents(): BpDevProgressEvent[] {
    return Array.from(this.progressEvents.values())
  }
}
