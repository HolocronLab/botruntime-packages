import * as botsStore from '../bots-store'
import type commandDefinitions from '../command-definitions'
import * as cloudIO from '../cloud-io'
import * as cloudProfileResolve from '../cloud-profile-resolve'
import * as errors from '../errors'
import { CloudCommand } from './cloud-command'

// brt link --bot-id <id> (--key-stdin | --key <k>) [--workspace-id <id>]
// Imports an existing bot on a second machine: writes bot.json/bot.local.json +
// the per-bot key into bots.json, without provisioning. Ported from the (deleted)
// thin brt CLI's commands/link.ts. The key travels out-of-band, never the repo;
// --key-stdin is preferred, --key is kept only for parity with the thin CLI (a
// script that already has the key in an env var, not the repo/argv literal).
export type LinkCommandDefinition = typeof commandDefinitions.link
export class LinkCommand extends CloudCommand<LinkCommandDefinition> {
  public async run(): Promise<void> {
    const requestedBotId = this.argv.botId
    if (!/^\d+$/.test(requestedBotId)) {
      throw new errors.BotpressCLIError(`--bot-id must be an integer, got "${this.argv.botId}"`)
    }
    const botId = (() => {
      if (this.isAgentProject) return requestedBotId
      const numeric = Number(requestedBotId)
      if (!Number.isSafeInteger(numeric)) {
        throw new errors.BotpressCLIError(
          `--bot-id must be a safe integer for classic bot.json projects, got "${requestedBotId}"`
        )
      }
      return String(numeric)
    })()

    const { name: profileName, profile } = await this.resolveProfile()
    const existingLink = this.loadLinkIfPresent()
    const apiUrl = this.resolveProfileAuthorityApiUrl(profile)
    if (this.argv.workspaceId !== undefined) {
      cloudProfileResolve.assertProfileAuthority('--workspace-id', { workspaceId: this.argv.workspaceId }, profile)
    }
    if (this.isAgentProject && !profile.workspaceId) {
      throw new errors.BotpressCLIError(`profile "${profileName}" has no workspaceId — re-run \`brt login\``)
    }
    if (this.argv.local && existingLink) {
      cloudProfileResolve.assertProfileAuthority(
        this.isAgentProject ? 'agent.local.json' : 'bot.local.json',
        existingLink,
        profile,
        { requireCoordinates: true }
      )
    }
    let workspaceId =
      this.argv.workspaceId ?? (this.isAgentProject || this.argv.local ? profile.workspaceId : undefined)
    if (this.argv.local && !workspaceId) {
      throw new errors.BotpressCLIError(`profile "${profileName}" has no workspaceId — re-run \`brt login\``)
    }
    if (!this.isAgentProject && workspaceId !== undefined) {
      if (!/^\d+$/.test(workspaceId) || !Number.isSafeInteger(Number(workspaceId))) {
        throw new errors.BotpressCLIError(
          `workspaceId must be a non-negative safe integer for classic bot.json projects, got "${workspaceId}"`
        )
      }
      workspaceId = String(Number(workspaceId))
    }

    let key = this.argv.key
    if (this.argv.keyStdin) key = await cloudIO.readSecretValue('per-bot key')
    if (!key) {
      throw new errors.BotpressCLIError('missing per-bot key — pass --key-stdin (preferred) or --key <k>')
    }

    // key -> bots.json FIRST (minted/imported once); only then the link, so a
    // crash between the two leaves a recoverable bot rather than an orphaned,
    // key-less link (mirrors thin deploy.ts's provision-then-link ordering).
    const store = this.readBotsStore()
    botsStore.setBotCreds(store, profileName, botId, { apiKey: key })
    this.writeBotsStore(store)

    const link = {
      botId,
      workspaceId,
      apiUrl,
      integrations: existingLink?.integrations,
    }
    this.saveLink(link)

    cloudIO.cloudInfo(`linked bot ${botId} (profile "${profileName}") -> ${apiUrl}`)
  }
}
