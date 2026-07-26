import { ScriptRunner } from '@holocronlab/botruntime-adk'
import type commandDefinitions from '../command-definitions'
import * as devWorkerEnv from '../dev-worker-env'
import * as errors from '../errors'
import { CloudCommand } from './cloud-command'

export type RunCommandDefinition = typeof commandDefinitions.run

type ResolvedRunTarget = {
  credentials: { token: string; apiUrl: string; workspaceId: string }
  env?: Record<string, string>
}

/**
 * Runs one local TypeScript process with the same selected agent target and
 * runtime context as brt dev, but without starting a worker, watcher or tunnel.
 */
export class RunCommand extends CloudCommand<RunCommandDefinition> {
  public async run(): Promise<void> {
    if (!this.isAgentProject) {
      throw new errors.BotpressCLIError('brt run requires an agent.config.ts project')
    }
    if (this.argv.prod && this.argv.local) {
      throw new errors.BotpressCLIError('--local selects a development stack and cannot be combined with --prod')
    }

    const credentials: ResolvedRunTarget = this.argv.prod
      ? await this._resolveProductionCredentials()
      : await this._resolveDevelopmentCredentials()

    const runner = new ScriptRunner({
      projectPath: this.projectDir,
      credentials: credentials.credentials,
      forceRegenerate: this.argv.force,
      prod: this.argv.prod,
    })
    const exitCode = await runner.run(this.argv.scriptPath, {
      args: this.argv.scriptArgs,
      env: credentials.env,
      inheritStdio: true,
    })
    this.setExitCode(exitCode)
  }

  private async _resolveProductionCredentials(): Promise<{
    credentials: { token: string; apiUrl: string; workspaceId: string }
  }> {
    const link = this.loadLink()
    if (this.argv.botId !== undefined && this.argv.botId !== link.botId) {
      throw new errors.BotpressCLIError(
        '--bot-id cannot override agent.json for brt run --prod; update the canonical link with brt link'
      )
    }
    const { profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    return {
      credentials: {
        token: profile.token,
        apiUrl,
        workspaceId: profile.workspaceId,
      },
    }
  }

  private async _resolveDevelopmentCredentials(): Promise<{
    credentials: { token: string; apiUrl: string; workspaceId: string }
    env: Record<string, string>
  }> {
    const target = await this.devCloudapiTarget()
    const { profile } = await this.resolveProfile()
    const configVars = await devWorkerEnv.fetchDevConfigVars({
      client: target.client,
      runtimeBotId: target.runtimeBotId,
      workspaceId: target.workspaceId,
    })
    return {
      credentials: {
        token: profile.token,
        apiUrl: target.client.base,
        workspaceId: target.workspaceId,
      },
      env: devWorkerEnv.buildDevWorkerEnvironment({
        inherited: process.env,
        apiUrl: target.client.base,
        token: profile.token,
        workspaceId: target.workspaceId,
        target: {
          runtimeBotId: target.runtimeBotId,
          targetBotId: target.targetBotId,
        },
        configVars,
      }),
    }
  }
}
