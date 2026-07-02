import dedent from 'dedent'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { AgentProject } from '../agent-project/index.js'
import { generateBotProject } from '../bot-generator/index.js'
import { generateAssetsTypes, generateAssetsRuntime } from '../generators/assets.js'
import { formatCode } from '../generators/utils.js'
import { BpBuildCommand } from '../commands/bp-build-command.js'
import { ConfigManager } from '../config/manager.js'
import { resolveProjectCredentials } from '../auth/index.js'
import { superviseChild } from './supervise-child.js'
import { AdkError } from '@holocronlab/botruntime-analytics'

/**
 * Find the agent project root by walking up from startPath looking for agent.config.ts
 */
async function findAgentRoot(startPath: string): Promise<string | null> {
  let currentPath = path.resolve(startPath)
  const root = path.parse(currentPath).root

  while (currentPath !== root) {
    try {
      await fs.access(path.join(currentPath, 'agent.config.ts'))
      return currentPath
    } catch {
      currentPath = path.dirname(currentPath)
    }
  }

  return null
}

export interface ScriptRunnerCredentials {
  /** Authentication token */
  token: string
  /** API URL */
  apiUrl: string
  /** Workspace ID */
  workspaceId?: string
}

export interface ScriptRunnerOptions {
  /** Path to the agent project root */
  projectPath: string
  /** Credentials for API access */
  credentials: ScriptRunnerCredentials
  /** Whether to regenerate the bot project even if it exists */
  forceRegenerate?: boolean
  /** Use production bot ID instead of dev bot ID (default: false, uses devId) */
  prod?: boolean
}

export interface RunScriptOptions extends ScriptRunnerOptions {
  /** Path to the script file to run (relative to project or absolute) */
  scriptPath: string
  /** Additional arguments to pass to the script */
  args?: string[]
  /** Environment variables to set */
  env?: Record<string, string>
  /** Whether to inherit stdio */
  inheritStdio?: boolean
}

export interface RunOptions {
  /** Additional arguments to pass to the script */
  args?: string[]
  /** Environment variables to set */
  env?: Record<string, string>
  /** Whether to inherit stdio */
  inheritStdio?: boolean
}

export interface TestRuntimeResult {
  /** Path to the bot project */
  botPath: string
  /** Path to the adk-runtime module that can be imported */
  runtimePath: string
  /** Bot ID being used */
  botId: string
  /** Workspace ID */
  workspaceId: string
  /** Whether using production bot */
  isProd: boolean
  /** The prepared project instance */
  project: AgentProject
  /**
   * Import and initialize the ADK runtime in the current process.
   * Call this once before running tests that need the runtime.
   * Returns the bot instance.
   */
  initialize: () => Promise<unknown>
}

export class ScriptRunner {
  private projectPath: string
  private forceRegenerate: boolean
  private prod: boolean
  private credentials: ScriptRunnerCredentials

  constructor(options: ScriptRunnerOptions) {
    this.projectPath = path.resolve(options.projectPath)
    this.forceRegenerate = options.forceRegenerate ?? false
    this.prod = options.prod ?? false
    this.credentials = options.credentials
  }

  /**
   * Ensure the bot project is generated and ready for script execution
   */
  async prepare(): Promise<{ botPath: string; runnerPath: string; project: AgentProject }> {
    const project = await AgentProject.load(this.projectPath, {
      adkCommand: 'adk-build',
    })

    const botPath = path.join(this.projectPath, '.adk', 'bot')
    const runnerPath = path.join(botPath, 'src', 'script-runner.ts')
    const botpressTypesPath = path.join(botPath, '.botpress', 'implementation', 'index.ts')

    // Check if we need to regenerate
    const needsRegenerate = this.forceRegenerate || !existsSync(runnerPath) || !existsSync(botpressTypesPath)

    if (needsRegenerate) {
      // Generate assets types first
      try {
        await generateAssetsTypes(project.path)
        await generateAssetsRuntime(project.path, project.agentInfo?.botId, { dev: true })
      } catch {
        // Assets directory might not exist
      }

      // Generate the bot project (script-runner is the dev-mode runner — keep the dev
      // assets-runtime so the lazy URL refresher is wired into the runtime bundle)
      await generateBotProject({
        projectPath: project.path,
        outputPath: botPath,
        adkCommand: 'adk-dev',
      })

      // Generate the script runner entry point
      await this.generateScriptRunner(botPath)

      // Run bp build to generate .botpress types
      await this.runBpBuild(botPath)
    }

    return { botPath, runnerPath, project }
  }

  /**
   * Run bp build to generate .botpress types needed for the script runner
   */
  private async runBpBuild(botPath: string): Promise<void> {
    const buildCommand = new BpBuildCommand({ botPath })

    return new Promise((resolve, reject) => {
      buildCommand.on('done', () => resolve())
      buildCommand.on('error', (err) => reject(new Error(err.message)))
      buildCommand.run()
    })
  }

  /**
   * Generate the script runner entry point that bootstraps the ADK runtime
   */
  private async generateScriptRunner(botPath: string): Promise<void> {
    const content = dedent`
      /**
       * ADK Script Runner Entry Point
       *
       * This file bootstraps the ADK runtime and then executes a user script.
       * It's auto-generated by the ADK CLI.
       */
      import * as bp from '.botpress'
      import { setupAdkRuntime } from './adk-runtime'
      import { context, agentRegistry } from '@holocronlab/botruntime-runtime/runtime'
      import { Autonomous } from '@holocronlab/botruntime-runtime'
      import { Client } from '@holocronlab/botruntime-client'
      import { BotSpecificClient, BotLogger } from '@holocronlab/botruntime-sdk'
      import { Cognitive } from '@holocronlab/botruntime-cognitive'

      // Create a minimal bot instance for runtime initialization
      const bot = new bp.Bot({
        actions: {}
      })

      // Initialize the ADK runtime
      setupAdkRuntime(bot)

      // Set up default context for script execution (outside of request handlers)
      const botId = process.env.ADK_BOT_ID!
      const workspaceId = process.env.ADK_WORKSPACE_ID!
      const token = process.env.ADK_TOKEN!
      const apiUrl = process.env.ADK_API_URL || 'https://api.botpress.cloud'
      const configuration = process.env.ADK_CONFIGURATION ? JSON.parse(process.env.ADK_CONFIGURATION) : {}

      const vanillaClient = new Client({ token, apiUrl, workspaceId, botId })
      const client = new BotSpecificClient(vanillaClient as any)
      const cognitive = new Cognitive({ client: client as any, __experimental_beta: true })
      const logger = new BotLogger({})

      context.setDefaultContext({
        executionId: 'script-execution',
        executionFinished: false,
        botId,
        client: client as any,
        cognitive: cognitive as any,
        citations: new Autonomous.CitationsManager(),
        logger: logger as any,
        configuration,
        integrations: agentRegistry.integrations,
        interfaces: agentRegistry.interfaces,
        plugins: agentRegistry.plugins,
        states: [],
        tags: [],
        scheduledHeavyImports: new Set<string>(),
      })

      // Export runtime utilities for scripts to use
      export { bot }

      // Get the script path from command line arguments
      const scriptPath = process.argv[2]

      if (!scriptPath) {
        console.error('Error: No script path provided')
        console.error('Usage: bun run script-runner.ts <script-path> [args...]')
        process.exit(1)
      }

      // Import and run the user script
      async function runScript() {
        try {
          // Dynamic import of the user script
          const scriptModule = await import(scriptPath)

          // If the script exports a default function, call it
          if (typeof scriptModule.default === 'function') {
            const args = process.argv.slice(3)
            await scriptModule.default(...args)
          }
          // If it exports a 'run' function, call it
          else if (typeof scriptModule.run === 'function') {
            const args = process.argv.slice(3)
            await scriptModule.run(...args)
          }
          // If it exports a 'main' function, call it
          else if (typeof scriptModule.main === 'function') {
            const args = process.argv.slice(3)
            await scriptModule.main(...args)
          }
          // Otherwise, the script should have run on import (top-level code)
        } catch (error) {
          console.error('Script execution failed:', error)
          process.exit(1)
        }
      }

      runScript()
    `

    await fs.writeFile(path.join(botPath, 'src', 'script-runner.ts'), await formatCode(content), 'utf-8')
  }

  /**
   * Setup the ADK runtime for use in tests (bun test)
   *
   * Unlike `run()`, this doesn't spawn a child process. Instead, it:
   * 1. Prepares the bot project (generates types, etc.)
   * 2. Sets up environment variables in the current process
   * 3. Returns paths and an initialize() function to import the runtime
   *
   * Usage in tests:
   * ```typescript
   * import { ScriptRunner } from '@holocronlab/botruntime-adk'
   *
   * const runner = new ScriptRunner({ projectPath: '.', credentials: {...} })
   * const runtime = await runner.setupTestRuntime()
   * await runtime.initialize()
   *
   * // Now you can import and use your actions, tools, etc.
   * ```
   */
  async setupTestRuntime(options: { env?: Record<string, string> } = {}): Promise<TestRuntimeResult> {
    const { botPath, project } = await this.prepare()

    // Determine which bot ID to use
    const botId = this.prod ? project.agentInfo?.botId : project.agentInfo?.devId || project.agentInfo?.botId
    const workspaceId = project.agentInfo?.workspaceId || this.credentials.workspaceId || ''

    if (!botId) {
      const idType = this.prod ? 'botId' : 'devId'
      const suggestion = this.prod
        ? 'Please deploy your agent first with "adk deploy".'
        : 'Please run "adk dev" first to create a development bot, or use --prod to use the production bot.'
      throw new AdkError({
        code: 'BOT_ID_REQUIRED',
        expected: true,
        message: `No ${idType} found in agent.json. ` + suggestion,
        suggestion,
      })
    }

    // Fetch configuration if bot ID is available
    let configuration: Record<string, unknown> | undefined
    try {
      const manager = new ConfigManager(botId, {
        project,
        credentials: this.credentials,
      })
      configuration = await manager.getAll()
    } catch {
      // Proceed without ADK_CONFIGURATION (it's still resolvable during
      // request handling). A real auth/network failure here leaves the script
      // silently config-less.
      // TODO(ADK-638): warn via the injected logger once adk has one —
      // include the fetch error.
    }

    // Set environment variables in the current process
    const envVars: Record<string, string> = {
      ADK_PROJECT_PATH: this.projectPath,
      ADK_BOT_PATH: botPath,
      ADK_BOT_ID: botId,
      ADK_WORKSPACE_ID: workspaceId,
      ADK_IS_PROD: this.prod ? 'true' : 'false',
      BP_DISABLE_WORKER_MODE: 'true',
      ADK_SCRIPT_MODE: 'true',
      ADK_TOKEN: this.credentials.token,
      ADK_API_URL: this.credentials.apiUrl,
      ...(configuration && { ADK_CONFIGURATION: JSON.stringify(configuration) }),
      ...options.env,
    }

    // Apply environment variables to current process
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value
    }

    const runtimePath = path.join(botPath, 'src', 'index.ts')

    return {
      botPath,
      runtimePath,
      botId,
      workspaceId,
      isProd: this.prod,
      project,
      initialize: async () => {
        // Dynamic import of the generated bot index which sets up the runtime
        const botModule = await import(runtimePath)

        // After the runtime is initialized, we need to set up a default context
        // that includes integrations from the agentRegistry
        const runtimeModule = await import('@holocronlab/botruntime-runtime/runtime')
        const { Autonomous } = await import('@holocronlab/botruntime-runtime')
        const { context, agentRegistry } = runtimeModule

        // Create a client for making API calls
        const { Client } = await import('@holocronlab/botruntime-client')
        const { BotSpecificClient, BotLogger } = await import('@holocronlab/botruntime-sdk')
        const { Cognitive } = await import('@holocronlab/botruntime-cognitive')

        const vanillaClient = new Client({
          token: this.credentials.token,
          apiUrl: this.credentials.apiUrl,
          workspaceId,
          botId,
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type mismatch between Client and BotSpecificClient
        const client = new BotSpecificClient(vanillaClient as any)

        const cognitive = new Cognitive({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type mismatch
          client: client as any,
          __experimental_beta: true,
        })

        const logger = new BotLogger({})

        // Set a default context that will be used as fallback when no AsyncLocalStorage context is active
        // This allows actions/integrations to work in tests without wrapping every call
        context.setDefaultContext({
          executionId: 'test-execution',
          executionFinished: false,
          botId,
          client: client as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          cognitive: cognitive as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          citations: new Autonomous.CitationsManager(),
          logger: logger as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          configuration: configuration ?? {},
          integrations: agentRegistry.integrations,
          interfaces: agentRegistry.interfaces,
          plugins: agentRegistry.plugins,
          states: [],
          tags: [],
          scheduledHeavyImports: new Set<string>(),
        })

        return botModule.default
      },
    }
  }

  /**
   * Run a script with the ADK runtime initialized
   */
  async run(scriptPath: string, options: RunOptions = {}): Promise<number> {
    const { botPath, runnerPath, project } = await this.prepare()

    // Resolve the script path
    const absoluteScriptPath = path.isAbsolute(scriptPath) ? scriptPath : path.resolve(this.projectPath, scriptPath)

    if (!existsSync(absoluteScriptPath)) {
      throw new AdkError({
        code: 'SCRIPT_NOT_FOUND',
        expected: true,
        message: `Script not found: ${absoluteScriptPath}`,
      })
    }

    // Determine which bot ID to use
    const botId = this.prod ? project.agentInfo?.botId : project.agentInfo?.devId || project.agentInfo?.botId
    const workspaceId = project.agentInfo?.workspaceId || this.credentials.workspaceId

    if (!botId) {
      const idType = this.prod ? 'botId' : 'devId'
      const suggestion = this.prod
        ? 'Please deploy your agent first with "adk deploy".'
        : 'Please run "adk dev" first to create a development bot, or use --prod to use the production bot.'
      throw new AdkError({
        code: 'BOT_ID_REQUIRED',
        expected: true,
        message: `No ${idType} found in agent.json. ` + suggestion,
        suggestion,
      })
    }

    // Build the command arguments
    const args = ['run', runnerPath, absoluteScriptPath, ...(options.args || [])]

    // Fetch configuration if bot ID is available
    let configuration: Record<string, unknown> | undefined
    try {
      const manager = new ConfigManager(botId, {
        project,
        credentials: this.credentials,
      })
      configuration = await manager.getAll()
    } catch {
      // Proceed without ADK_CONFIGURATION (it's still resolvable during
      // request handling). A real auth/network failure here leaves the script
      // silently config-less.
      // TODO(ADK-638): warn via the injected logger once adk has one —
      // include the fetch error.
    }

    // Merge environment variables
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),

      // Set the project path so scripts can reference it
      ADK_PROJECT_PATH: this.projectPath,
      ADK_BOT_PATH: botPath,
      // Set bot context
      ADK_BOT_ID: botId,
      ADK_WORKSPACE_ID: workspaceId || '',
      ADK_IS_PROD: this.prod ? 'true' : 'false',
      // Disable worker mode for scripts
      BP_DISABLE_WORKER_MODE: 'true',
      ...options.env,
      ADK_SCRIPT_MODE: 'true',
      ADK_SCRIPT_PATH: absoluteScriptPath,
      ADK_TOKEN: this.credentials.token,
      ADK_API_URL: this.credentials.apiUrl,
      // Inject configuration so it's available at module load time
      ...(configuration && { ADK_CONFIGURATION: JSON.stringify(configuration) }),
    }

    const child = spawn('bun', args, {
      cwd: botPath,
      env,
      stdio: options.inheritStdio !== false ? 'inherit' : 'pipe',
    })

    return superviseChild(child)
  }
}

/**
 * Convenience function to run a script with the ADK runtime
 */
export async function runScript(options: RunScriptOptions): Promise<number> {
  const runner = new ScriptRunner({
    projectPath: options.projectPath,
    forceRegenerate: options.forceRegenerate,
    prod: options.prod,
    credentials: options.credentials,
  })

  return runner.run(options.scriptPath, {
    args: options.args,
    env: options.env,
    inheritStdio: options.inheritStdio,
  })
}

export interface SetupTestRuntimeOptions {
  /**
   * Path to the agent project root.
   * If not provided, auto-detects by walking up from CWD looking for agent.config.ts
   */
  projectPath?: string
  /**
   * Credentials for API access.
   * If not provided, loads from the current ADK profile (~/.adk/credentials)
   */
  credentials?: ScriptRunnerCredentials
  /** Whether to regenerate the bot project even if it exists */
  forceRegenerate?: boolean
  /** Use production bot ID instead of dev bot ID (default: false, uses devId) */
  prod?: boolean
  /** Additional environment variables to set */
  env?: Record<string, string>
}

/**
 * Convenience function to setup the ADK runtime for tests.
 *
 * This is designed to be called from test setup (beforeAll, globalSetup, etc.)
 * to prepare the ADK runtime environment without spawning a child process.
 *
 * Features:
 * - Auto-detects project path by walking up from CWD looking for agent.config.ts
 * - Auto-loads credentials from the current ADK profile (~/.adk/credentials)
 * - Both can be overridden via options
 *
 * @example
 * ```typescript
 * // Minimal usage - auto-detects everything
 * import { setupTestRuntime } from '@holocronlab/botruntime-adk'
 *
 * beforeAll(async () => {
 *   const runtime = await setupTestRuntime()
 *   await runtime.initialize()
 * })
 *
 * // With explicit options
 * beforeAll(async () => {
 *   const runtime = await setupTestRuntime({
 *     projectPath: '/path/to/agent',
 *     credentials: { token: 'custom-token', apiUrl: 'https://api.botpress.cloud' },
 *     prod: true,
 *   })
 *   await runtime.initialize()
 * })
 * ```
 */
export async function setupTestRuntime(options: SetupTestRuntimeOptions = {}): Promise<TestRuntimeResult> {
  // Auto-detect project path if not provided
  let projectPath = options.projectPath
  if (!projectPath) {
    const detected = await findAgentRoot(process.cwd())
    if (!detected) {
      throw new AdkError({
        code: 'PROJECT_NOT_FOUND',
        expected: true,
        message:
          'Could not find ADK agent project. No agent.config.ts found in current directory or parents.\n' +
          'Either run from within an agent project directory, or provide projectPath explicitly.',
        suggestion: 'Either run from within an agent project directory, or provide projectPath explicitly.',
      })
    }
    projectPath = detected
  }

  // Auto-load credentials if not provided
  let credentials = options.credentials
  if (!credentials) {
    const loadedCredentials = await resolveProjectCredentials({
      project: { path: projectPath },
    })
    credentials = {
      token: loadedCredentials.token,
      apiUrl: loadedCredentials.apiUrl,
      ...(loadedCredentials.workspaceId ? { workspaceId: loadedCredentials.workspaceId } : {}),
    }
  }

  const runner = new ScriptRunner({
    projectPath,
    forceRegenerate: options.forceRegenerate,
    prod: options.prod,
    credentials,
  })

  return runner.setupTestRuntime({ env: options.env })
}
