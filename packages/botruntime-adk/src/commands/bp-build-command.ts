import { execa, type ResultPromise } from 'execa'
import { join } from 'path'
import { access } from 'fs/promises'
import { getBpCli, getBpCliEnvironment } from './bp-cli.js'
import { BaseCommand } from './base-command.js'
import { optimizeSourceMap } from '../utils/source-map-optimizer.js'

export interface BpBuildCommandOptions {
  botPath: string
}

export class BpBuildCommand extends BaseCommand<never, void> {
  private childProcess: ResultPromise | null = null
  private killed = false

  constructor(private options: BpBuildCommandOptions) {
    super()
  }

  async run(): Promise<void> {
    const { botPath } = this.options

    // Get bp command path
    const { path: bpCommand } = getBpCli()

    const args = ['build', '--sourceMap']

    this.childProcess = execa(bpCommand, args, {
      cwd: botPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getBpCliEnvironment(),
      extendEnv: false,
    })

    // Capture stdout
    if (this.childProcess.stdout) {
      this.childProcess.stdout.on('data', (data: Buffer) => {
        const text = data.toString()
        this.emit('stdout', text)
      })
    }

    // Capture stderr
    if (this.childProcess.stderr) {
      this.childProcess.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        this.emit('stderr', text)
      })
    }

    // Handle process exit
    this.childProcess.then(
      async () => {
        // Process completed successfully - optimize source map
        await this.optimizeSourceMapIfExists()
        this.emit('done', undefined)
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- child process error callback
      (error: any) => {
        if (this.killed) {
          return
        }

        const errorObj = {
          exitCode: error.exitCode ?? 1,
          stderr: error.stderr || '',
          message: error.message || 'Process exited with error',
        }

        this.emit('error', errorObj)
      }
    )
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

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    this.killed = true
    if (this.childProcess) {
      this.childProcess.kill(signal)
    }
  }
}
