import { execa, type ResultPromise } from 'execa'
import { getBpCli, getBpCliEnvironment } from './bp-cli.js'
import { BaseCommand } from './base-command.js'

export interface BpChatCommandOptions {
  botId: string
  workspaceId: string
  credentials: {
    token: string
    apiUrl: string
  }
  projectPath?: string
}

export class BpChatCommand extends BaseCommand<never> {
  private childProcess: ResultPromise | null = null

  constructor(private options: BpChatCommandOptions) {
    super()
  }

  async run(): Promise<void> {
    const { botId, workspaceId, credentials } = this.options

    // Get bp command path (uses bundled CLI)
    const { path: bpCommand } = getBpCli()

    const bpArgs = [
      'chat',
      '--botId',
      botId,
      '--workspaceId',
      workspaceId,
      '--token',
      credentials.token,
      '--apiUrl',
      credentials.apiUrl,
    ]

    this.childProcess = execa(bpCommand, bpArgs, {
      stdio: 'inherit',
      env: getBpCliEnvironment(),
      extendEnv: false,
    })

    try {
      // Wait for the process to complete
      await this.childProcess
    } catch (error: unknown) {
      // Emit error in the expected format
      const errObj = error != null && typeof error === 'object' ? error : {}
      this.emit('error', {
        exitCode: 'exitCode' in errObj ? (errObj as { exitCode: number }).exitCode || 1 : 1,
        stderr: 'stderr' in errObj ? (errObj as { stderr: string }).stderr || '' : '',
        message: error instanceof Error ? error.message || 'Chat command failed' : 'Chat command failed',
      })
      throw error
    }
  }

  kill(signal?: NodeJS.Signals | number): void {
    if (this.childProcess) {
      this.childProcess.kill(signal)
    }
  }
}
