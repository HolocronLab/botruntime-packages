import chalk from 'chalk'
import * as fs from 'fs'
import _ from 'lodash'
import { CloudapiClient } from '../api/cloudapi-client'
import { ApiClient, PublicOrPrivateIntegration, IntegrationSummary } from '../api/client'
import * as adkBundle from '../adk-bundle'
import * as botsStore from '../bots-store'
import { toCatalogSchema } from '../cloud-catalog-schema'
import { cloudInfo, readSecretValue } from '../cloud-io'
import * as cloudProfileResolve from '../cloud-profile-resolve'
import type * as cloudLink from '../cloud-project-link'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { NamePackageRef, parsePackageRef } from '../package-ref'
import * as utils from '../utils'
import { BuildCommand } from './build-command'
import { CloudCommand } from './cloud-command'
import { GlobalCommand } from './global-command'
import { ProjectCommand } from './project-command'

export type GetIntegrationCommandDefinition = typeof commandDefinitions.integrations.subcommands.get
export class GetIntegrationCommand extends GlobalCommand<GetIntegrationCommandDefinition> {
  public async run(): Promise<void> {
    const api = await this.ensureLoginAndCreateClient(this.argv)
    const parsedRef = parsePackageRef(this.argv.integrationRef)
    if (!parsedRef) {
      throw new errors.InvalidPackageReferenceError(this.argv.integrationRef)
    }
    if (parsedRef.type === 'path') {
      throw new errors.BotpressCLIError('Cannot get local integration')
    }

    try {
      const integration = await api.findPublicOrPrivateIntegration(parsedRef)
      if (integration) {
        this.logger.success(`Integration ${chalk.bold(this.argv.integrationRef)}:`)
        this.logger.json(integration)
        return
      }
    } catch (thrown) {
      throw errors.BotpressCLIError.wrap(thrown, `Could not get integration ${this.argv.integrationRef}`)
    }

    throw new errors.BotpressCLIError(`Integration ${this.argv.integrationRef} not found`)
  }
}

export type ListIntegrationsCommandDefinition = typeof commandDefinitions.integrations.subcommands.list
export class ListIntegrationsCommand extends GlobalCommand<ListIntegrationsCommandDefinition> {
  public async run(): Promise<void> {
    const api = await this.ensureLoginAndCreateClient(this.argv)

    const { dev, public: isPublic, owned } = this.argv

    if (dev && isPublic) {
      throw new errors.BotpressCLIError(
        'Cannot use --dev and --public flags together as dev integrations are always private'
      )
    }
    if (dev && owned) {
      throw new errors.BotpressCLIError(
        'Cannot use --dev and --owned flags together as dev integrations are always owned by the current workspace'
      )
    }

    try {
      const integrations = await this._listAllIntegrations(api)
      this.logger.success('Integrations:')
      this.logger.json(integrations)
    } catch (thrown) {
      throw errors.BotpressCLIError.wrap(thrown, 'Could not list integrations')
    }
  }

  private _listAllIntegrations = async (api: ApiClient): Promise<IntegrationSummary[]> => {
    if (this.argv.dev) {
      return this._listDevIntegrations(api)
    }

    if (this.argv.public && this.argv.owned) {
      const [owned, publicIntegrations] = await Promise.all([
        this._listOwnedIntegrations(api),
        this._listPublicIntegrations(api),
      ])
      return _.intersectionBy(owned, publicIntegrations, (i) => i.id).slice(0, this.argv.limit)
    }

    if (this.argv.owned) {
      return this._listOwnedIntegrations(api)
    }

    if (this.argv.public) {
      return this._listPublicIntegrations(api)
    }

    const [owned, publicIntegrations] = await Promise.all([
      this._listOwnedIntegrations(api),
      this._listPublicIntegrations(api),
    ])
    return _.uniqBy([...owned, ...publicIntegrations], (i) => i.id).slice(0, this.argv.limit)
  }

  private _listDevIntegrations = async (api: ApiClient): Promise<IntegrationSummary[]> => {
    const { name, versionNumber: version } = this.argv
    return api.client.list.integrations({ dev: true, name, version }).collect({ limit: this.argv.limit })
  }

  private _listOwnedIntegrations = async (api: ApiClient): Promise<IntegrationSummary[]> => {
    const { name, versionNumber: version } = this.argv
    return api.client.list.integrations({ name, version }).collect({ limit: this.argv.limit })
  }

  private _listPublicIntegrations = async (api: ApiClient): Promise<IntegrationSummary[]> => {
    const { name, versionNumber: version } = this.argv
    return api.client.list.publicIntegrations({ name, version }).collect({ limit: this.argv.limit })
  }
}

export type DeleteIntegrationCommandDefinition = typeof commandDefinitions.integrations.subcommands.delete
export class DeleteIntegrationCommand extends GlobalCommand<DeleteIntegrationCommandDefinition> {
  public async run(): Promise<void> {
    const api = await this.ensureLoginAndCreateClient(this.argv)
    const parsedRef = parsePackageRef(this.argv.integrationRef)
    if (!parsedRef) {
      throw new errors.InvalidPackageReferenceError(this.argv.integrationRef)
    }
    if (parsedRef.type === 'path') {
      throw new errors.BotpressCLIError('Cannot delete local integration')
    }

    let integrationId: string | undefined
    if (parsedRef.type === 'id') {
      integrationId = parsedRef.id
    } else {
      const integration = await this._findIntegration(api, parsedRef)
      integrationId = integration.id
    }

    try {
      await api.client.deleteIntegration({ id: integrationId })
    } catch (thrown) {
      throw errors.BotpressCLIError.wrap(thrown, `Could not delete integration ${this.argv.integrationRef}`)
    }

    this.logger.success(`Integration ${chalk.bold(this.argv.integrationRef)} deleted`)
    return
  }

  private _findIntegration = async (api: ApiClient, parsedRef: NamePackageRef) => {
    let integration: PublicOrPrivateIntegration | undefined

    try {
      integration = await api.findPrivateIntegration(parsedRef)
    } catch (thrown) {
      throw errors.BotpressCLIError.wrap(thrown, `Could not get integration ${this.argv.integrationRef}`)
    }

    if (!integration) {
      const publicIntegration = await api.findPublicIntegration(parsedRef)
      if (publicIntegration) {
        throw new errors.BotpressCLIError(`Integration ${this.argv.integrationRef} does not belong to your workspace`)
      }

      throw new errors.BotpressCLIError(`Integration ${this.argv.integrationRef} not found`)
    }

    return integration
  }
}

// ---------------------------------------------------------------------------
// Bespoke cloudapi wire (brt integrations install|register|publish), ported
// from the (deleted) thin brt CLI's commands/integrations.ts. Added ALONGSIDE
// the Botpress-shaped get/list/delete above under new, non-colliding
// subcommand names. install/register address a bot via bot.json/bot.local.json
// + bots.json (CloudCommand, same as `brt link`/`brt config`); the MVP
// supports exactly one installed channel per bot (the supervisor child throws
// on >1), so a second `install` with a different alias fails loud.
// ---------------------------------------------------------------------------

export type CloudIntegrationInstallCommandDefinition = typeof commandDefinitions.integrations.subcommands.install
export class CloudIntegrationInstallCommand extends CloudCommand<CloudIntegrationInstallCommandDefinition> {
  public async run(): Promise<void> {
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)

    const [name, version = '0.0.1'] = this.argv.ref.split('@')
    if (!name) {
      throw new errors.BotpressCLIError(`invalid integration ref "${this.argv.ref}" — expected name or name@version`)
    }
    const alias = this.argv.alias ?? name

    const conflicting = (link.integrations ?? []).find((i) => i.alias !== alias)
    if (conflicting) {
      throw new errors.BotpressCLIError(
        `bot ${botId} already has integration "${conflicting.alias}" installed — this wire supports one channel per bot`
      )
    }

    const config = await this._readConfig()
    const res = await client.installIntegration(botId, name, version, config, this.argv.alias)

    // webhookSecret is shown once -> bots.json (never bot.json); webhookId is
    // public -> bot.json, so `brt integrations register` can find it again.
    const store = this.readBotsStore()
    const existingCreds = botsStore.getBotCreds(store, profileName, botId)
    if (!existingCreds?.apiKey) {
      throw new errors.BotpressCLIError(
        `bot ${botId} has no per-bot key on record in ${this.botsStorePath()} — this should not happen after a successful install`
      )
    }
    botsStore.setBotCreds(store, profileName, botId, { apiKey: existingCreds.apiKey, webhookSecret: res.webhookSecret })
    this.writeBotsStore(store)

    const entry: cloudLink.IntegrationLink = { ref: `${name}@${version}`, alias, webhookId: res.webhookId }
    this.saveLink({ ...link, integrations: [...(link.integrations ?? []).filter((i) => i.alias !== alias), entry] })

    cloudInfo(`installed ${name}@${version} alias=${alias} webhookId=${res.webhookId}`)
    cloudInfo(`webhookSecret stored in ${this.botsStorePath()} (shown once). Now: brt integrations register ${res.webhookId}`)
  }

  private async _readConfig(): Promise<Record<string, unknown>> {
    if (!this.argv.configFile && !this.argv.configStdin) {
      throw new errors.BotpressCLIError('missing integration config — pass --config-stdin or --config-file <path>')
    }
    const raw = await readSecretValue('integration config JSON', this.argv.configFile)
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch (thrown) {
      throw errors.BotpressCLIError.wrap(thrown, 'integration config is not valid JSON')
    }
  }
}

export type CloudIntegrationRegisterCommandDefinition = typeof commandDefinitions.integrations.subcommands.register
export class CloudIntegrationRegisterCommand extends CloudCommand<CloudIntegrationRegisterCommandDefinition> {
  public async run(): Promise<void> {
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)

    const res = await client.registerIntegration(botId, this.argv.webhookId)
    cloudInfo(`registered ${res.webhookId} -> ${res.webhookUrl}`)
  }
}

// CloudIntegrationPublishCommand is workspace-scoped (no bot.json / x-bot-id
// involved — /v1/admin/integration-definitions and .../publish-bundle are not
// per-bot endpoints), so unlike install/register it does not need CloudCommand;
// it extends ProjectCommand instead to reuse this fork's own native
// integration.definition.ts reader + esbuild bundler. This is a deliberate
// divergence from thin's publish(), which shelled out to an external, un-forked
// `bp read --json` binary that has no equivalent in this fork's toolchain.
export type CloudIntegrationPublishCommandDefinition = typeof commandDefinitions.integrations.subcommands.publish
export class CloudIntegrationPublishCommand extends ProjectCommand<CloudIntegrationPublishCommandDefinition> {
  public async run(): Promise<void> {
    const { profile } = await cloudProfileResolve.resolveProfile({
      argvProfile: this.argv.profile,
      getActiveProfile: () => this.globalCache.get('activeProfile'),
      readProfile: (n) => this.readProfileFromFS(n),
    })
    const apiUrl = cloudProfileResolve.resolveApiUrl(this.argv.apiUrl, profile)
    const client = new CloudapiClient(apiUrl, profile.token)

    const { name, version, configSchema } = await this._resolveNameVersionSchema()

    const existing = (await client.listIntegrationDefinitions(profile.workspaceId)).definitions.find(
      (d) => d.name === name && d.version === version
    )
    // An empty/undefined workspaceId marks a built-in, catalog-managed
    // definition: its SCHEMA is not re-published through this path, only its
    // bundle (code). Publishing a schema change for a built-in is a separate,
    // operator-run migration.
    const builtinExisting = !!existing && (existing.workspaceId === undefined || existing.workspaceId === null)
    if (builtinExisting) {
      cloudInfo(`built-in ${name}@${version} exists — schema unchanged, publishing bundle`)
    } else {
      if (configSchema === undefined) {
        throw new errors.BotpressCLIError(
          'non-built-in publish requires a config schema — omit --name/--version to read it from ' +
            'integration.definition.ts, or pass --config-schema-file'
        )
      }
      const upserted = existing
        ? await client.updateIntegrationDefinition(existing.id, name, version, configSchema, profile.workspaceId)
        : await client.createIntegrationDefinition(name, version, configSchema, profile.workspaceId)
      cloudInfo(
        `${existing ? 'updated' : 'published'} integration definition ${upserted.name}@${upserted.version} (id=${upserted.id})`
      )
    }

    if (this.argv.noBundle) {
      cloudInfo('bundle upload skipped (--noBundle); definition/schema only')
      cloudInfo('next: brt integrations publish (without --noBundle) to upload the runnable bundle')
      return
    }

    if (!this.argv.noBuild) {
      await new BuildCommand(this.api, this.prompt, this.logger, this.argv).setProjectContext(this.projectContext).run()
    }
    const bundlePath = this.projectPaths.abs.outFileCJS
    if (!fs.existsSync(bundlePath)) {
      throw new errors.BotpressCLIError(`bundle not found at ${bundlePath} — remove --noBuild, or build the project first`)
    }
    const code = await fs.promises.readFile(bundlePath, 'utf-8')
    const localHash = adkBundle.sha256(code)
    cloudInfo(`bundle ${bundlePath} (${code.length} bytes, sha256 ${localHash.slice(0, 12)}…)`)

    const pub = await client.publishIntegrationBundle(name, version, code, profile.workspaceId)
    if (pub.contentHash !== localHash) {
      throw new errors.BotpressCLIError(`publish MISMATCH: local sha256 ${localHash} != server ${pub.contentHash}`)
    }
    cloudInfo(`uploaded bundle (integrationId=${pub.integrationId}, versionId=${pub.versionId})`)
  }

  private async _resolveNameVersionSchema(): Promise<{ name: string; version: string; configSchema: unknown }> {
    if (this.argv.name && this.argv.versionNumber) {
      return {
        name: this.argv.name,
        version: this.argv.versionNumber,
        configSchema: this.argv.configSchemaFile ? await this._readJsonFile(this.argv.configSchemaFile) : undefined,
      }
    }

    const { projectType, resolveProjectDefinition } = this.readProjectDefinitionFromFS()
    if (projectType !== 'integration') {
      throw new errors.BotpressCLIError(
        `brt integrations publish (without --name/--versionNumber) requires an integration project at ${this.projectPaths.abs.workDir}`
      )
    }
    const { definition } = await resolveProjectDefinition()

    let configSchema: unknown
    if (this.argv.configSchemaFile) {
      configSchema = await this._readJsonFile(this.argv.configSchemaFile)
    } else if (definition.configuration) {
      const jsonSchema = await utils.schema.mapZodToJsonSchema(definition.configuration, {
        useLegacyZuiTransformer: definition.__advanced?.useLegacyZuiTransformer,
        toJSONSchemaOptions: definition.__advanced?.toJSONSchemaOptions,
      })
      configSchema = toCatalogSchema(jsonSchema)
      if (!configSchema) {
        throw new errors.BotpressCLIError(
          'could not derive a catalog config schema from integration.definition.ts — pass --config-schema-file <json>'
        )
      }
    }

    return { name: definition.name, version: definition.version, configSchema }
  }

  private async _readJsonFile(path: string): Promise<unknown> {
    const raw = await fs.promises.readFile(path, 'utf8')
    try {
      return JSON.parse(raw)
    } catch (thrown) {
      throw errors.BotpressCLIError.wrap(thrown, `${path} is not valid JSON`)
    }
  }
}
