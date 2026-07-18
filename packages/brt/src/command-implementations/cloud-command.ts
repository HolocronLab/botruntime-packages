import { CloudapiClient } from '../api/cloudapi-client'
import * as fs from 'fs'
import * as path from 'path'
import * as agentLink from '../adk-agent-link'
import * as botsStoreModule from '../bots-store'
import * as cloudProfileResolve from '../cloud-profile-resolve'
import * as cloudLink from '../cloud-project-link'
import * as config from '../config'
import * as errors from '../errors'
import { resolveDevBotTarget } from '../dev-target'
import type { CommandDefinition } from '../typings'
import * as utils from '../utils'
import { GlobalCommand, ProfileCredentials } from './global-command'

// CloudCommand — shared base for the bespoke-cloudapi-wire commands (`brt link`,
// `brt config`, `brt secret`). This is a SEPARATE surface from the Botpress-shaped
// `ProjectCommand` (bot.definition.ts / --token / --workspace-id). Agent projects
// use agent.json/agent.local.json as their canonical coordinates; bot*.json is
// retained only as a classic/legacy coordinate fallback and as optional public
// integration metadata. Per-bot credentials still live only in bots.json.
export type CloudCommandDefinition = CommandDefinition<typeof config.schemas.cloudProject>

export interface CloudProjectTarget {
  botId?: string
  workspaceId?: string
  apiUrl?: string
  integrations?: cloudLink.IntegrationLink[]
}

export type DiagnosticCloudTarget =
  | {
      client: CloudapiClient
      output: { environment: 'production'; workspaceId: string; botId: string }
      workspaceId: string
      botId: string
    }
  | {
      client: CloudapiClient
      output: {
        environment: 'development'
        workspaceId: string
        runtimeBotId: string
        targetBotId: string
      }
      workspaceId: string
      runtimeBotId: string
      targetBotId: string
    }

export type EvalCloudTarget =
  | {
      client: CloudapiClient
      output: { environment: 'production'; workspaceId: string; botId: string }
      selector: string
    }
  | {
      client: CloudapiClient
      output: {
        environment: 'development'
        workspaceId: string
        runtimeBotId: string
        targetBotId: string
      }
      selector: string
      runtimeBotId: string
    }

export abstract class CloudCommand<C extends CloudCommandDefinition> extends GlobalCommand<C> {
  protected get projectDir(): string {
    return utils.path.absoluteFrom(utils.path.cwd(), this.argv.workDir)
  }

  protected get linkEnv(): cloudLink.LinkEnv {
    return this.argv.local ? 'local' : 'prod'
  }

  protected get targetsDevBot(): boolean {
    return Boolean((this.argv as { dev?: boolean }).dev)
  }

  protected get isAgentProject(): boolean {
    return fs.existsSync(path.join(this.projectDir, 'agent.config.ts'))
  }

  protected loadLink(): CloudProjectTarget {
    const target = this.loadLinkIfPresent()
    if (!target) {
      throw new errors.BotpressCLIError(
        `${this._canonicalLinkFileName()} not found in ${this.projectDir} — run \`brt link --bot-id <id>\` first`
      )
    }
    return target
  }

  protected loadLinkIfPresent(): CloudProjectTarget | undefined {
    const legacy = cloudLink.loadLinkIfPresent(this.projectDir, this.linkEnv)
    const legacyTarget = legacy ? this._fromLegacyLink(legacy) : undefined
    if (!this.isAgentProject) return legacyTarget

    if (this.linkEnv === 'prod') {
      const canonical = agentLink.readAgentInfoIfPresent(this.projectDir)
      if (!canonical) return legacyTarget
      return {
        botId: canonical.botId,
        workspaceId: canonical.workspaceId,
        apiUrl: canonical.apiUrl,
        integrations: legacy?.integrations,
      }
    }

    const canonicalPath = agentLink.agentLocalInfoFilePath(this.projectDir)
    if (!fs.existsSync(canonicalPath)) return legacyTarget
    const canonical = agentLink.readAgentLocalInfo(this.projectDir)
    // agent.local.json also owns the dev-id cache. A file containing only
    // devId/devTargetBotId is not a canonical non-dev target and must not
    // shadow the one-release bot.local.json coordinate fallback.
    if (canonical.botId === undefined) return legacyTarget
    return {
      botId: canonical.botId,
      workspaceId: canonical.workspaceId,
      apiUrl: canonical.apiUrl,
      integrations: legacy?.integrations,
    }
  }

  protected saveLink(target: CloudProjectTarget): void {
    if (!this.isAgentProject) {
      cloudLink.saveLink(this.projectDir, this.linkEnv, this._toLegacyLink(target))
      return
    }

    if (this.linkEnv === 'prod' && target.botId !== undefined && target.workspaceId !== undefined) {
      const existing = agentLink.readAgentInfoIfPresent(this.projectDir)
      if (
        !existing ||
        existing.botId !== target.botId ||
        existing.workspaceId !== target.workspaceId ||
        existing.apiUrl !== target.apiUrl
      ) {
        agentLink.writeAgentInfo(this.projectDir, {
          botId: target.botId,
          workspaceId: target.workspaceId,
          apiUrl: target.apiUrl,
        })
      }
      this._saveAgentIntegrationMetadata(target.integrations)
      return
    }

    if (this.linkEnv === 'local' && target.botId !== undefined) {
      const existing = agentLink.readAgentLocalInfo(this.projectDir)
      if (
        existing.botId !== target.botId ||
        existing.workspaceId !== target.workspaceId ||
        existing.apiUrl !== target.apiUrl
      ) {
        agentLink.writeAgentLocalInfo(this.projectDir, {
          botId: target.botId,
          workspaceId: target.workspaceId,
          apiUrl: target.apiUrl,
        })
      }
      this._saveAgentIntegrationMetadata(target.integrations)
      return
    }

    if (
      (this.linkEnv === 'prod' && fs.existsSync(agentLink.agentInfoFilePath(this.projectDir))) ||
      (this.linkEnv === 'local' && fs.existsSync(agentLink.agentLocalInfoFilePath(this.projectDir)))
    ) {
      // Do not copy canonical coordinates back into bot*.json merely because
      // an older or partial agent link lacks a field. Metadata remains usable.
      this._saveAgentIntegrationMetadata(target.integrations)
      return
    }

    // One-release compatibility path for agent projects that still have only
    // a legacy bot*.json link and not enough coordinates to migrate safely.
    cloudLink.saveLink(this.projectDir, this.linkEnv, this._toLegacyLink(target))
  }

  // --bot-id always overrides the canonical project target; otherwise the
  // environment-specific link must carry one.
  protected requireBotId(link: CloudProjectTarget): string {
    if (this.argv.botId) return this.argv.botId
    if (link.botId === undefined) {
      throw new errors.BotpressCLIError(
        `no botId in ${this._canonicalLinkFileName()} — run \`brt link --bot-id <id>\` first, or pass --bot-id`
      )
    }
    return link.botId
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

  protected resolveApiUrl(profile: ProfileCredentials, link?: CloudProjectTarget): string {
    const apiUrl = this.resolveProfileAuthorityApiUrl(profile)
    if (link !== undefined) {
      const hasLinkedTarget =
        link.botId !== undefined || link.apiUrl !== undefined || link.workspaceId !== undefined
      cloudProfileResolve.assertProfileAuthority(this._canonicalLinkFileName(), link, profile, {
        requireCoordinates: this.linkEnv === 'local' || (this.isAgentProject && hasLinkedTarget),
      })
    }
    return apiUrl
  }

  protected resolveProfileAuthorityApiUrl(profile: ProfileCredentials): string {
    const apiUrl = cloudProfileResolve.resolveApiUrl(this.argv.apiUrl, profile)
    cloudProfileResolve.assertProfileAuthority('command target override', {
      apiUrl,
      workspaceId: profile.workspaceId,
    }, profile, {
      requireCoordinates: true,
    })
    return apiUrl
  }

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

  protected async botCloudapiClient(profileName: string, botId: string, apiUrl: string): Promise<CloudapiClient> {
    const store = this.readBotsStore()
    const creds = botsStoreModule.getBotCreds(store, profileName, botId)
    if (
      typeof creds?.apiKey !== 'string' ||
      creds.apiKey.length === 0 ||
      creds.apiKey !== creds.apiKey.trim() ||
      /[\u0000-\u001f\u007f]/.test(creds.apiKey)
    ) {
      throw new errors.BotpressCLIError(
        `no per-bot key for bot ${botId} in ${this.botsStorePath()} (profile "${profileName}") — ` +
          `this bot was not linked from this machine; run \`brt link --bot-id ${botId} --key-stdin\``
      )
    }
    return new CloudapiClient(apiUrl, creds.apiKey)
  }

  protected async workspaceAdminCloudapiTarget(): Promise<{
    client: CloudapiClient
    workspaceId: string
    botId: string
  }> {
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    if (!profile.workspaceId) {
      throw new errors.BotpressCLIError(
        `profile "${profileName}" has no workspaceId — re-run \`brt login\` before managing the production bot`
      )
    }
    return {
      client: this.machineCloudapiClient(profile, apiUrl),
      workspaceId: profile.workspaceId,
      botId,
    }
  }

  private _canonicalLinkFileName(): string {
    if (!this.isAgentProject) return cloudLink.linkFileName(this.linkEnv)
    return this.linkEnv === 'local' ? 'agent.local.json' : 'agent.json'
  }

  private _fromLegacyLink(link: cloudLink.BotLink): CloudProjectTarget {
    return {
      botId: link.botId === undefined ? undefined : String(link.botId),
      workspaceId: link.workspaceId === undefined ? undefined : String(link.workspaceId),
      apiUrl: link.apiUrl,
      integrations: link.integrations,
    }
  }

  private _toLegacyLink(target: CloudProjectTarget): cloudLink.BotLink {
    return {
      botId: target.botId === undefined ? undefined : Number(target.botId),
      workspaceId: target.workspaceId === undefined ? undefined : Number(target.workspaceId),
      apiUrl: target.apiUrl,
      integrations: target.integrations,
    }
  }

  private _saveAgentIntegrationMetadata(integrations: cloudLink.IntegrationLink[] | undefined): void {
    const metadataPath = cloudLink.linkFilePath(this.projectDir, this.linkEnv)
    if (!integrations?.length) {
      if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath)
      return
    }
    cloudLink.saveLink(this.projectDir, this.linkEnv, { integrations })
  }

  protected async devCloudapiTarget(): Promise<{
    client: CloudapiClient
    workspaceId: string
    runtimeBotId: string
    targetBotId: string
  }> {
    let workspaceId: string | undefined
    let apiUrl: string | undefined
    if (this.argv.local) {
      const localStack = this._readLocalStackMetadata()
      if (!localStack.apiUrl) {
        throw new errors.BotpressCLIError(
          `${localStack.fileName} has no apiUrl — --dev --local cannot use profile stack coordinates`
        )
      }
      if (!localStack.workspaceId) {
        throw new errors.BotpressCLIError(
          `${localStack.fileName} has no workspaceId — --dev --local cannot use profile stack coordinates`
        )
      }
      apiUrl = localStack.apiUrl.replace(/\/+$/, '')
      workspaceId = localStack.workspaceId
    }
    const { name: profileName, profile } = await this.resolveProfile()
    const profileApiUrl = this.resolveProfileAuthorityApiUrl(profile)
    if (this.argv.local) {
      cloudProfileResolve.assertProfileAuthority(
        this._canonicalLinkFileName(),
        { apiUrl, workspaceId },
        profile,
        { requireCoordinates: true }
      )
    }
    workspaceId ??= profile.workspaceId
    if (!workspaceId) {
      throw new errors.BotpressCLIError(
        `profile "${profileName}" and local project metadata have no workspaceId — re-run \`brt login\` before using --dev`
      )
    }
    apiUrl ??= profileApiUrl
    const cached = this._readCachedDevTarget({ apiUrl, workspaceId })
    const runtimeBotId = this.argv.botId ?? cached.runtimeBotId
    if (!runtimeBotId) {
      throw new errors.BotpressCLIError(
        'no dev target scoped to the selected stack — run `brt dev` for this stack before using a command with --dev'
      )
    }
    const client = new CloudapiClient(apiUrl, profile.token)
    const response = await client.getDevBotTarget(runtimeBotId, workspaceId)
    const expectedTarget = runtimeBotId === cached.runtimeBotId ? cached.targetBotId : undefined
    const target = resolveDevBotTarget(response.bot, runtimeBotId, expectedTarget)
    this._persistResolvedDevTarget(target.runtimeBotId, target.targetBotId, apiUrl, workspaceId)
    return { client, workspaceId, ...target }
  }

  // Shared read-only diagnostic target. Production authority is the selected
  // profile PAT plus canonical numeric workspace/bot coordinates. Development
  // authority is the same PAT narrowed by the attested opaque runtime bot id.
  protected async diagnosticCloudapiTarget(): Promise<DiagnosticCloudTarget> {
    if (this.targetsDevBot) {
      const target = await this.devCloudapiTarget()
      return {
        ...target,
        output: {
          environment: 'development',
          workspaceId: target.workspaceId,
          runtimeBotId: target.runtimeBotId,
          targetBotId: target.targetBotId,
        },
      }
    }

    const link = this.loadLink()
    const botId = requirePositiveDiagnosticIdentity('botId', this.requireBotId(link))
    const workspaceId = requirePositiveDiagnosticIdentity('workspaceId', link.workspaceId)
    const { profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    return {
      client: this.machineCloudapiClient(profile, apiUrl),
      output: { environment: 'production', workspaceId, botId },
      workspaceId,
      botId,
    }
  }

  // Hosted eval endpoints are bot-scoped. Production therefore uses the
  // saved per-bot key, while development uses the profile PAT narrowed by the
  // attested opaque x-bot-id resolver. Query/path IDs never establish scope.
  protected async evalCloudapiTarget(): Promise<EvalCloudTarget> {
    if (this.targetsDevBot) {
      const target = await this.devCloudapiTarget()
      return {
        client: target.client,
        selector: target.runtimeBotId,
        runtimeBotId: target.runtimeBotId,
        output: {
          environment: 'development',
          workspaceId: target.workspaceId,
          runtimeBotId: target.runtimeBotId,
          targetBotId: target.targetBotId,
        },
      }
    }

    const link = this.loadLink()
    const botId = requirePositiveDiagnosticIdentity('botId', this.requireBotId(link))
    const workspaceId = requirePositiveDiagnosticIdentity('workspaceId', link.workspaceId)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    return {
      client: await this.botCloudapiClient(profileName, botId, apiUrl),
      selector: botId,
      output: { environment: 'production', workspaceId, botId },
    }
  }

  private _readLocalStackMetadata(): { fileName: string; workspaceId?: string; apiUrl?: string } {
    if (fs.existsSync(path.join(this.projectDir, 'agent.config.ts'))) {
      const local = agentLink.readAgentLocalInfo(this.projectDir)
      return { fileName: 'agent.local.json', workspaceId: local.workspaceId, apiUrl: local.apiUrl }
    }
    const local = cloudLink.loadLinkIfPresent(this.projectDir, 'local')
    return {
      fileName: 'bot.local.json',
      workspaceId: local?.workspaceId === undefined ? undefined : String(local.workspaceId),
      apiUrl: local?.apiUrl,
    }
  }

  private _readCachedDevTarget(
    selected: { apiUrl: string; workspaceId: string }
  ): {
    runtimeBotId?: string
    targetBotId?: string
  } {
    if (fs.existsSync(path.join(this.projectDir, 'agent.config.ts'))) {
      const local = agentLink.readAgentLocalInfo(this.projectDir)
      const target = agentLink.resolveAgentDevTargetForStack(local, selected)
      if (target) return { runtimeBotId: target.runtimeBotId, targetBotId: target.targetBotId }
      const legacyRuntimeHint = agentLink.getLegacyAgentDevRuntimeHint(local)
      return legacyRuntimeHint ? { runtimeBotId: legacyRuntimeHint } : {}
    }
    const cachePath = path.join(this.projectDir, '.botpress', 'project.cache.json')
    if (!fs.existsSync(cachePath)) return {}
    try {
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
        devId?: string
        devTargetBotId?: string
      }
      return { runtimeBotId: cache.devId, targetBotId: cache.devTargetBotId }
    } catch (thrown) {
      throw errors.BotpressCLIError.wrap(thrown, `${cachePath} is not valid JSON`)
    }
  }

  private _persistResolvedDevTarget(
    runtimeBotId: string,
    targetBotId: string,
    apiUrl: string,
    workspaceId: string
  ): void {
    if (fs.existsSync(path.join(this.projectDir, 'agent.config.ts'))) {
      agentLink.writeAgentLocalDevTarget(this.projectDir, runtimeBotId, targetBotId, apiUrl, workspaceId)
      return
    }
    const cachePath = path.join(this.projectDir, '.botpress', 'project.cache.json')
    let cache: Record<string, unknown> = {}
    if (fs.existsSync(cachePath)) {
      try {
        cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Record<string, unknown>
      } catch (thrown) {
        throw errors.BotpressCLIError.wrap(thrown, `${cachePath} is not valid JSON`)
      }
    }
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    fs.writeFileSync(cachePath, JSON.stringify({ ...cache, devId: runtimeBotId, devTargetBotId: targetBotId }, null, 2))
  }
}

const POSITIVE_DECIMAL_ID = /^[1-9][0-9]*$/

function requirePositiveDiagnosticIdentity(field: 'workspaceId' | 'botId', value: string | undefined): string {
  if (value === undefined) {
    throw new errors.BotpressCLIError(
      `canonical project link has no ${field}; run \`brt link --bot-id <id> --workspace-id <id>\` first`
    )
  }
  if (!POSITIVE_DECIMAL_ID.test(value)) {
    throw new errors.BotpressCLIError(`canonical project link ${field} must be a positive decimal ID`)
  }
  return value
}
