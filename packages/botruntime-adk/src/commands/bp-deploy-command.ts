import { execa, type ResultPromise } from 'execa'
import { getBpCli, getBpCliEnvironment } from './bp-cli.js'
import { BaseCommand } from './base-command.js'

export interface BpDeployCommandOptions {
  botPath: string
  botId: string
  workspaceId: string
  credentials: {
    token: string
    apiUrl: string
  }
  /** Secret values to pass to bp deploy via --secrets flags */
  secrets?: Record<string, string>
}

export class BpDeployCommand extends BaseCommand<never, void> {
  private childProcess: ResultPromise | null = null
  private killed = false

  constructor(private options: BpDeployCommandOptions) {
    super()
  }

  async run(): Promise<void> {
    const { botPath, botId, workspaceId, credentials } = this.options

    // Get bp command path
    const { path: bpCommand } = getBpCli()

    const args = [
      'deploy',
      '--botId',
      botId,
      '-y', // Auto-confirm
      '--noBuild', // ADK already built the generated bot project before invoking bp deploy.
      '--token',
      credentials.token,
      '--workspaceId',
      workspaceId,
      '--apiUrl',
      credentials.apiUrl,
    ]

    // Pass secret values via --secrets flags so bp deploy includes them
    if (this.options.secrets) {
      for (const [key, value] of Object.entries(this.options.secrets)) {
        args.push('--secrets', `${key}=${value}`)
      }
    }

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
      () => {
        // Process completed successfully
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

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    this.killed = true
    if (this.childProcess) {
      this.childProcess.kill(signal)
    }
  }
}
