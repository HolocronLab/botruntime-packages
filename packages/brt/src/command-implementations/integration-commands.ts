import chalk from 'chalk'
import _ from 'lodash'
import semver from 'semver'
import {
  CloudapiClient,
  type WorkspaceIntegrationInstallation,
} from '../api/cloudapi-client'
import { ApiClient, PublicOrPrivateIntegration, IntegrationSummary } from '../api/client'
import * as adkBundle from '../adk-bundle'
import { cloudInfo, readSecretValue } from '../cloud-io'
import type * as cloudLink from '../cloud-project-link'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { NamePackageRef, parsePackageRef } from '../package-ref'
import type { CommandArgv } from '../typings'
import { CloudCommand } from './cloud-command'
import { DeployCommand, type DeployCommandDefinition } from './deploy-command'
import { GlobalCommand } from './global-command'
import { ProjectCommand } from './project-command'

type AgentDependencyMutationTarget = {
  env: 'dev' | 'prod'
  apiUrl: string
  workspaceId: string
  targetBotId: string
  runtimeBotId?: string
  client: CloudapiClient
}

async function refreshCompletedAgentDependencySnapshot(opts: {
  projectDir: string
  mutation: string
  local: boolean
  target: AgentDependencyMutationTarget
}): Promise<void> {
  const statefulCommand = opts.target.env === 'dev'
    ? `brt dev${opts.local ? ' --local' : ''}`
    : `brt deploy --adk${opts.local ? ' --local' : ''}`

  const target = {
    env: opts.target.env,
    apiUrl: opts.target.apiUrl.replace(/\/+$/, ''),
    workspaceId: opts.target.workspaceId,
    botId: opts.target.targetBotId,
  } as const
  try {
    const { refreshCompletedDependencySnapshot } = await adkBundle.loadAdkDependencyRefreshTools()
    const client = {
      getBot: ({ id }: { id: string }) => opts.target.client.getDevBotTarget(id, target.workspaceId),
    }
    const result = await refreshCompletedDependencySnapshot({
      projectPath: opts.projectDir,
      client: client as any,
      target,
      ...(target.env === 'dev' ? { runtimeBotId: opts.target.runtimeBotId } : {}),
    })
    if (result.status === 'not-initialized') {
      cloudInfo(
        `${opts.mutation} succeeded in Cloud. The selected target has no completed dependency snapshot; run ${statefulCommand}.`
      )
      return
    }
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(
      thrown,
      `${opts.mutation} succeeded in Cloud, but the local ADK dependency snapshot could not be refreshed. ` +
        `The previous snapshot was preserved; run ${statefulCommand} to reconcile the exact target before continuing.`
    )
  }

  cloudInfo(
    target.env === 'dev'
      ? 'dependency snapshot refreshed; a running brt dev watcher will regenerate the agent bundle'
      : `dependency snapshot refreshed; run ${statefulCommand} before production acceptance`
  )
}

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

const EXACT_INTEGRATION_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]*(?:\/[A-Za-z0-9][A-Za-z0-9._:-]*)?$/

export function parseExactIntegrationRef(ref: string): { name: string; version: string } {
  const separator = ref.indexOf('@')
  const name = separator > 0 ? ref.slice(0, separator) : ''
  const version = separator > 0 ? ref.slice(separator + 1) : ''
  const canonicalVersion = semver.valid(version)
  if (
    separator !== ref.lastIndexOf('@') ||
    !EXACT_INTEGRATION_NAME.test(name) ||
    !canonicalVersion ||
    canonicalVersion !== version
  ) {
    throw new errors.BotpressCLIError(
      `invalid integration ref "${ref}" — expected name@version or namespace/name@version with an exact SemVer ` +
        '(for example telegram@1.1.3 or botruntime/yookassa@0.1.0); implicit, latest, and range versions are not supported'
    )
  }
  return { name, version }
}

export function resolveUniqueIntegrationInstallationByAlias(
  installations: WorkspaceIntegrationInstallation[],
  alias: string,
): WorkspaceIntegrationInstallation {
  // Botforge stores an omitted alias as ""; an explicit alias must shadow any name-derived candidate.
  const explicitMatches = installations.filter(
    (installation) => installation.alias !== '' && installation.alias === alias,
  )
  const matches =
    explicitMatches.length > 0
      ? explicitMatches
      : installations.filter(
          (installation) =>
            installation.alias === '' &&
            (installation.name === alias ||
              (!alias.includes('/') && installation.name.endsWith(`/${alias}`))),
        )
  if (matches.length === 0) {
    throw new errors.BotpressCLIError(
      `no integration installation found with alias "${alias}" on the selected target`,
    )
  }
  if (matches.length !== 1) {
    throw new errors.BotpressCLIError(
      `${matches.length} integration installations found with alias "${alias}" on the selected target; ` +
        'refusing to choose one',
    )
  }
  return matches[0]!
}

// install/register/upgrade use the bot-target Cloud API channel. publish is
// defined below as an integration-only alias for the canonical deploy path.

export type CloudIntegrationInstallCommandDefinition = typeof commandDefinitions.integrations.subcommands.install
export class CloudIntegrationInstallCommand extends CloudCommand<CloudIntegrationInstallCommandDefinition> {
  public async run(): Promise<void> {
    const { name, version } = parseExactIntegrationRef(this.argv.ref)
    const alias = this.argv.alias ?? name
    if (this.targetsDevBot) {
      const target = await this.devCloudapiTarget()
      const config = await this._readConfig()
      const res = await target.client.installWorkspaceIntegration(
        target.workspaceId,
        target.targetBotId,
        name,
        version,
        config,
        this.argv.alias
      )
      if (this.isAgentProject) {
        await refreshCompletedAgentDependencySnapshot({
          projectDir: this.projectDir,
          mutation: `Integration ${name}@${version} install`,
          local: this.argv.local,
          target: {
            env: 'dev',
            apiUrl: target.client.base,
            workspaceId: target.workspaceId,
            targetBotId: target.targetBotId,
            runtimeBotId: target.runtimeBotId,
            client: target.client,
          },
        })
      }
      cloudInfo(`installed ${name}@${version} alias=${alias} webhookId=${res.webhookId} status=${res.status}`)
      cloudInfo(
        `register with: brt integrations register ${res.webhookId} --dev${this.argv.local ? ' --local' : ''}`
      )
      return
    }
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = new CloudapiClient(apiUrl, profile.token)

    const conflicting = (link.integrations ?? []).find((i) => i.alias !== alias)
    if (conflicting) {
      throw new errors.BotpressCLIError(
        `bot ${botId} already has integration "${conflicting.alias}" installed — this wire supports one channel per bot`
      )
    }

    const config = await this._readConfig()
    const res = await client.installWorkspaceIntegration(
      profile.workspaceId,
      botId,
      name,
      version,
      config,
      this.argv.alias
    )

    const entry: cloudLink.IntegrationLink = { ref: `${name}@${version}`, alias, webhookId: res.webhookId }
    this.saveLink({ ...link, integrations: [...(link.integrations ?? []).filter((i) => i.alias !== alias), entry] })

    if (this.isAgentProject) {
      await refreshCompletedAgentDependencySnapshot({
        projectDir: this.projectDir,
        mutation: `Integration ${name}@${version} install`,
        local: this.argv.local,
        target: {
          env: 'prod',
          apiUrl,
          workspaceId: profile.workspaceId,
          targetBotId: botId,
          client: new CloudapiClient(apiUrl, profile.token),
        },
      })
    }

    cloudInfo(`installed ${name}@${version} alias=${alias} webhookId=${res.webhookId}`)
    cloudInfo(`register with: brt integrations register ${res.webhookId}`)
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

export type CloudIntegrationUpgradeCommandDefinition = typeof commandDefinitions.integrations.subcommands.upgrade
function isDefinitiveRepointRejection(thrown: unknown): boolean {
  if (!(thrown instanceof errors.HTTPError) || thrown.status === undefined) {
    return false
  }
  // Only 4xx proves rejection; transport failures and 5xx can arrive after a non-idempotent POST commits.
  return thrown.status >= 400 && thrown.status < 500
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function shellQuoteArgument(value: string): string {
  if (value.length > 0 && /^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value
  }
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export class CloudIntegrationUpgradeCommand extends CloudCommand<CloudIntegrationUpgradeCommandDefinition> {
  public async run(): Promise<void> {
    const { name, version } = parseExactIntegrationRef(this.argv.ref)
    const targetRef = `${name}@${version}`
    const alias = this.argv.alias ?? name
    if (this.argv.wait) {
      throw new errors.BotpressCLIError(
        'runtime readiness is not supported by Cloud yet; remove --wait. No mutation was attempted',
      )
    }
    if (!this.isAgentProject) {
      throw new errors.BotpressCLIError(
        'brt integrations upgrade requires an ADK agent project and its selected target',
      )
    }

    const target = await this.diagnosticCloudapiTarget()
    const targetBotId = 'targetBotId' in target ? target.targetBotId : target.botId
    const listed = await target.client.listWorkspaceIntegrations(target.workspaceId, targetBotId)
    const current = resolveUniqueIntegrationInstallationByAlias(listed.installations, alias)
    if (current.ref === targetRef) {
      throw new errors.BotpressCLIError(
        `integration installation ${current.id} already points to ${targetRef}; no mutation was attempted`,
      )
    }

    let repointed: unknown
    try {
      repointed = await target.client.repointWorkspaceIntegration(
        target.workspaceId,
        targetBotId,
        current.id,
        name,
        version,
      )
    } catch (thrown) {
      if (isDefinitiveRepointRejection(thrown)) {
        throw thrown
      }
      throw errors.BotpressCLIError.wrap(
        thrown,
        this._outcomeUnknownMessage(current, targetRef, alias),
      )
    }
    if (
      !isJsonObject(repointed) ||
      repointed.ok !== true ||
      repointed.installationId !== current.id ||
      typeof repointed.integrationId !== 'string' ||
      repointed.integrationId.length === 0 ||
      repointed.ref !== targetRef
    ) {
      const receivedInstallationId =
        isJsonObject(repointed) && typeof repointed.installationId === 'string'
          ? repointed.installationId
          : '<invalid>'
      const receivedRef =
        isJsonObject(repointed) && typeof repointed.ref === 'string' ? repointed.ref : '<invalid>'
      throw new errors.BotpressCLIError(
        `${this._outcomeUnknownMessage(current, targetRef, alias)} ` +
          `Cloud returned an inconsistent success response: expected installation ${current.id} at ${targetRef}, ` +
          `received ${receivedInstallationId} at ${receivedRef}.`,
      )
    }

    try {
      if ('botId' in target) {
        this._updateProductionLink(current, targetRef, alias)
      }
      const snapshotTarget: AgentDependencyMutationTarget =
        'targetBotId' in target
          ? {
              env: 'dev',
              apiUrl: target.client.base,
              workspaceId: target.workspaceId,
              targetBotId,
              runtimeBotId: target.runtimeBotId,
              client: target.client,
            }
          : {
              env: 'prod',
              apiUrl: target.client.base,
              workspaceId: target.workspaceId,
              targetBotId,
              client: target.client,
            }
      await refreshCompletedAgentDependencySnapshot({
        projectDir: this.projectDir,
        mutation: `Integration ${alias} repoint to ${targetRef}`,
        local: this.argv.local,
        target: snapshotTarget,
      })
    } catch (thrown) {
      throw errors.BotpressCLIError.wrap(
        thrown,
        `server-side repoint already completed for installation ${current.id}; do not retry install or register automatically. ` +
          `Roll back with: ${this._rollbackCommand(current.ref, alias)}.`,
      )
    }

    cloudInfo(`upgraded installation ${current.id} alias=${alias} ${current.ref} -> ${targetRef}`)
    cloudInfo(`existing webhook ${current.webhookId} remains attached; install and register were not called`)
  }

  private _updateProductionLink(
    current: WorkspaceIntegrationInstallation,
    targetRef: string,
    requestedAlias: string,
  ): void {
    const link = this.loadLink()
    const integrations = link.integrations ?? []
    const existing = integrations.find((candidate) => candidate.webhookId === current.webhookId)
    const effectiveAlias = current.alias || existing?.alias || requestedAlias
    const entry: cloudLink.IntegrationLink = {
      ref: targetRef,
      alias: effectiveAlias,
      webhookId: current.webhookId,
    }
    this.saveLink({
      ...link,
      integrations: [
        ...integrations.filter(
          (candidate) => candidate.webhookId !== current.webhookId && candidate.alias !== effectiveAlias,
        ),
        entry,
      ],
    })
  }

  private _targetFlags(): string {
    return `${this.argv.dev ? ' --dev' : ''}${this.argv.local ? ' --local' : ''}`
  }

  private _outcomeUnknownMessage(
    current: WorkspaceIntegrationInstallation,
    targetRef: string,
    alias: string,
  ): string {
    return (
      `repoint outcome is unknown for installation ${current.id}; do not retry install or register. ` +
      `Inspect the selected target's current installation ref for alias ${JSON.stringify(alias)}. ` +
      `If ${targetRef} is active, roll back with: ${this._rollbackCommand(current.ref, alias)}.`
    )
  }

  private _rollbackCommand(ref: string, alias: string): string {
    return `brt integrations upgrade ${ref} --alias=${shellQuoteArgument(alias)}${this._targetFlags()}`
  }
}

export type CloudIntegrationRegisterCommandDefinition = typeof commandDefinitions.integrations.subcommands.register
export class CloudIntegrationRegisterCommand extends CloudCommand<CloudIntegrationRegisterCommandDefinition> {
  public async run(): Promise<void> {
    if (this.targetsDevBot) {
      const target = await this.devCloudapiTarget()
      const res = await target.client.registerWorkspaceIntegration(
        target.workspaceId,
        target.targetBotId,
        this.argv.webhookId
      )
      if (this.isAgentProject) {
        await refreshCompletedAgentDependencySnapshot({
          projectDir: this.projectDir,
          mutation: `Integration webhook ${this.argv.webhookId} registration`,
          local: this.argv.local,
          target: {
            env: 'dev',
            apiUrl: target.client.base,
            workspaceId: target.workspaceId,
            targetBotId: target.targetBotId,
            runtimeBotId: target.runtimeBotId,
            client: target.client,
          },
        })
      }
      cloudInfo(`registered ${this.argv.webhookId} -> ${res.webhookUrl}`)
      return
    }
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = new CloudapiClient(apiUrl, profile.token)

    const res = await client.registerWorkspaceIntegration(profile.workspaceId, botId, this.argv.webhookId)
    if (this.isAgentProject) {
      await refreshCompletedAgentDependencySnapshot({
        projectDir: this.projectDir,
        mutation: `Integration webhook ${this.argv.webhookId} registration`,
        local: this.argv.local,
        target: {
          env: 'prod',
          apiUrl,
          workspaceId: profile.workspaceId,
          targetBotId: botId,
          client: new CloudapiClient(apiUrl, profile.token),
        },
      })
    }
    cloudInfo(`registered ${this.argv.webhookId} -> ${res.webhookUrl}`)
  }
}

// Public integration publishing is an integration-only spelling of the
// canonical deploy flow. Keeping a single mutation path is important: the
// Botpress-shaped integration entity owns both Hub metadata and the runnable
// definition/bundle, and its name is namespaced through manageWorkspaceHandle.
export type CloudIntegrationPublishCommandDefinition = typeof commandDefinitions.integrations.subcommands.publish
export class CloudIntegrationPublishCommand extends ProjectCommand<CloudIntegrationPublishCommandDefinition> {
  public async run(): Promise<void> {
    const { projectType } = this.readProjectDefinitionFromFS()
    if (projectType !== 'integration') {
      throw new errors.BotpressCLIError(
        `brt integrations publish requires an integration project at ${this.projectPaths.abs.workDir}`
      )
    }

    const deployArgv = {
      ...this.argv,
      adk: false,
      watch: false,
      local: false,
      botId: undefined,
      name: undefined,
      createNewBot: false,
      visibility: 'public',
      public: false,
      allowDestructiveTableChanges: false,
    } as CommandArgv<DeployCommandDefinition>

    await new DeployCommand(this.api, this.prompt, this.logger, deployArgv)
      .setProjectContext(this.projectContext)
      .run()
  }
}
