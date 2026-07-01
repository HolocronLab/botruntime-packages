import * as botsStore from '../bots-store'
import type commandDefinitions from '../command-definitions'
import { cloudInfo, readSecretValue } from '../cloud-io'
import type { BotLink } from '../cloud-project-link'
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
    const botId = Number(this.argv.botId)
    if (!Number.isInteger(botId)) {
      throw new errors.BotpressCLIError(`--bot-id must be an integer, got "${this.argv.botId}"`)
    }

    let key = this.argv.key
    if (this.argv.keyStdin) key = await readSecretValue('per-bot key')
    if (!key) {
      throw new errors.BotpressCLIError('missing per-bot key — pass --key-stdin (preferred) or --key <k>')
    }

    const { name: profileName, profile } = await this.resolveProfile()
    const existingLink = this.loadLinkIfPresent()
    const apiUrl = this.resolveApiUrl(profile, existingLink)

    // key -> bots.json FIRST (minted/imported once); only then the link, so a
    // crash between the two leaves a recoverable bot rather than an orphaned,
    // key-less link (mirrors thin deploy.ts's provision-then-link ordering).
    const store = this.readBotsStore()
    botsStore.setBotCreds(store, profileName, String(botId), { apiKey: key })
    this.writeBotsStore(store)

    const link: BotLink = { ...existingLink, botId, apiUrl }
    if (this.argv.workspaceId) link.workspaceId = Number(this.argv.workspaceId)
    this.saveLink(link)

    cloudInfo(`linked bot ${botId} (profile "${profileName}") -> ${apiUrl}`)
  }
}
