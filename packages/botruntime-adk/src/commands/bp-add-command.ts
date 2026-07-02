import { execa, type ResultPromise } from 'execa'
import { getBpCli, getBpCliEnvironment } from './bp-cli.js'
import { BaseCommand } from './base-command.js'

export interface BpAddCommandOptions {
  resource: string // Full resource string like "integration:slack@1.0.0" or "interface:translator@1.0.0"
  botPath: string
  workspaceId: string
  credentials: {
    token: string
    apiUrl: string
  }
}

export class BpAddCommand extends BaseCommand<never, void> {
  private childProcess: ResultPromise | null = null
  private killed = false

  constructor(private options: BpAddCommandOptions) {
    super()
  }

  async run(): Promise<void> {
    const { resource, botPath, workspaceId, credentials } = this.options

    // Get bp command path
    const { path: bpCommand } = getBpCli()

    const args = [
      'add',
      resource, // Use resource as-is (already includes integration: or interface: prefix)
      '-y',
      '--installPath',
      botPath,
      '--token',
      credentials.token,
      '--workspaceId',
      workspaceId,
      '--apiUrl',
      credentials.apiUrl,
    ]

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
