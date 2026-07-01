import { CloudapiClient } from '../api/cloudapi-client'
import * as botsStoreModule from '../bots-store'
import * as cloudProfileResolve from '../cloud-profile-resolve'
import * as cloudLink from '../cloud-project-link'
import * as config from '../config'
import * as errors from '../errors'
import type { CommandDefinition } from '../typings'
import * as utils from '../utils'
import { GlobalCommand, ProfileCredentials } from './global-command'

// CloudCommand — shared base for the bespoke-cloudapi-wire commands (`brt link`,
// `brt config`, `brt secret`). This is a SEPARATE surface from the Botpress-shaped
// `ProjectCommand` (bot.definition.ts / --token / --workspace-id): it addresses a
// bot through the ported bot.json/bot.local.json link file (see cloud-project-link.ts)
// and a per-bot key persisted in bots.json (see bots-store.ts), matching the
// (deleted) thin brt CLI's context.ts byte-for-byte on the wire.
export type CloudCommandDefinition = CommandDefinition<typeof config.schemas.cloudProject>

export abstract class CloudCommand<C extends CloudCommandDefinition> extends GlobalCommand<C> {
  protected get projectDir(): string {
    return utils.path.absoluteFrom(utils.path.cwd(), this.argv.workDir)
  }

  protected get linkEnv(): cloudLink.LinkEnv {
    return this.argv.local ? 'local' : 'prod'
  }

  protected loadLink(): cloudLink.BotLink {
    return cloudLink.loadLink(this.projectDir, this.linkEnv)
  }

  protected loadLinkIfPresent(): cloudLink.BotLink | undefined {
    return cloudLink.loadLinkIfPresent(this.projectDir, this.linkEnv)
  }

  protected saveLink(link: cloudLink.BotLink): void {
    cloudLink.saveLink(this.projectDir, this.linkEnv, link)
  }

  // --bot-id always overrides the link (parity with thin's per-command --bot-id
  // escape hatch); otherwise the linked bot.json/bot.local.json must carry one.
  protected requireBotId(link: cloudLink.BotLink): string {
    if (this.argv.botId) return this.argv.botId
    if (link.botId === undefined) {
      throw new errors.BotpressCLIError(
        `no botId in ${cloudLink.linkFileName(this.linkEnv)} — run \`brt link --bot-id <id>\` first, or pass --bot-id`
      )
    }
    return String(link.botId)
  }

  // Profile/apiUrl resolution is shared with DeployCommand's `--adk` path and
  // the machine-scope integration publish command (neither of which is a
  // CloudCommand) — see cloud-profile-resolve.ts for the actual logic.
  private get _profileResolveDeps(): cloudProfileResolve.ProfileResolveDeps {
    return {
      argvProfile: this.argv.profile,
      getActiveProfile: () => this.globalCache.get('activeProfile'),
      readProfile: (name) => this.readProfileFromFS(name),
    }
  }

  protected async resolveProfileName(): Promise<string> {
    return cloudProfileResolve.resolveProfileName(this._profileResolveDeps)
  }

  protected async resolveProfile(): Promise<{ name: string; profile: ProfileCredentials }> {
    return cloudProfileResolve.resolveProfile(this._profileResolveDeps)
  }

  protected resolveApiUrl(profile: ProfileCredentials, link?: cloudLink.BotLink): string {
    return cloudProfileResolve.resolveApiUrl(this.argv.apiUrl, profile, link)
  }

  // machineCloudapiClient — Bearer = the profile's (machine) token; used for
  // provision-bot / listing. Per-bot operations must use botCloudapiClient below.
  protected machineCloudapiClient(profile: ProfileCredentials, apiUrl: string): CloudapiClient {
    return new CloudapiClient(apiUrl, profile.token)
  }

  protected botsStorePath(): string {
    return this.globalPaths.abs.botsStoreFile
  }

  protected readBotsStore(): botsStoreModule.BotsStore {
    return botsStoreModule.readBotsStore(this.botsStorePath())
  }

  protected writeBotsStore(store: botsStoreModule.BotsStore): void {
    botsStoreModule.writeBotsStore(this.botsStorePath(), store)
  }

  // botCloudapiClient — Bearer = the bot's per-bot key from bots.json. Required
  // for all per-bot operations (config-vars, integrations, bundle).
  protected async botCloudapiClient(profileName: string, botId: string, apiUrl: string): Promise<CloudapiClient> {
    const store = this.readBotsStore()
    const creds = botsStoreModule.getBotCreds(store, profileName, botId)
    if (!creds?.apiKey) {
      throw new errors.BotpressCLIError(
        `no per-bot key for bot ${botId} in ${this.botsStorePath()} (profile "${profileName}") — ` +
          `this bot was not linked from this machine; run \`brt link --bot-id ${botId} --key-stdin\``
      )
    }
    return new CloudapiClient(apiUrl, creds.apiKey)
  }
}
