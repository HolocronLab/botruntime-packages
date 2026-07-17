import * as client from '@holocronlab/botruntime-client'
import type {
  CloudDependencyReadiness,
  CloudReadinessDependency,
  CloudReadinessProjection,
  DependencyReadinessIssue,
  DependencyStatus,
} from '@holocronlab/botruntime-adk/dependencies'
import * as sdk from '@holocronlab/botruntime-sdk'
import { TunnelRequest, TunnelResponse } from '@holocronlab/botruntime-tunnel'
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import chalk from 'chalk'
import { isEqual } from 'lodash'
import * as pathlib from 'path'
import * as uuid from 'uuid'
import * as apiUtils from '../api'
import { CloudapiClient, type DevBotReadinessBot, type DevBotReadinessIntegration } from '../api/cloudapi-client'
import * as agentLink from '../adk-agent-link'
import * as adkBundle from '../adk-bundle'
import * as adkDevId from '../adk-dev-id'
import { secretEnvVariableName, stripSecretEnvVariablePrefix } from '../code-generation/secret-module'
import type commandDefinitions from '../command-definitions'
import { cloudInfo } from '../cloud-io'
import * as cloudProfileResolve from '../cloud-profile-resolve'
import * as cloudLink from '../cloud-project-link'
import * as errors from '../errors'
import {
  parseServerRuntimeContract,
  RuntimeContractError,
  type RuntimeContractReadiness,
} from '../runtime-contract'
import { assertPlatformToolchainCompatible, inspectPlatformToolchain } from '../toolchain-contract'
import { resolveDevBotTarget, type DevBotTarget } from '../dev-target'
import { buildDevWorkerEnvironment } from '../dev-worker-env'
import { DevTraceIngestServer } from '../dev-trace-ingest'
import { formatTunnelFailure, isTunnelUnavailableStatus } from '../dev-tunnel-diagnostics'
import * as tables from '../tables'
import type { CommandArgv } from '../typings'
import * as utils from '../utils'
import { Worker } from '../worker'
import { AddCommand, type AddCommandDefinition } from './add-command'
import { BuildCommand } from './build-command'
import { ProjectCommand, ProjectDefinition } from './project-command'

const DEFAULT_BOT_PORT = 8075
const DEFAULT_INTEGRATION_PORT = 8076
const TUNNEL_HELLO_INTERVAL = 5000
const FILEWATCHER_DEBOUNCE_MS = 500
const ADK_DEV_DEPENDENCY_ENV = 'dev' as const
const PRODUCTION_BOT_ID_TAG = 'botruntime.productionBotId'
const CANONICAL_PLUGIN_ALIAS_RE = /^[a-z][a-z0-9_-]{1,99}$/
const INTEGRATION_INSTANCE_ALIAS_RE = /^(?:[a-z][a-z0-9_-]*\/)?[a-z][a-z0-9_-]*$/

function developmentProductionTags(
  apiUrl: string | undefined,
  productionBotId: string | number | undefined
): Record<string, string> | undefined {
  // This tag belongs to botruntime's grouping contract, not the upstream Botpress API.
  if (!apiUrl || agentLink.isBotpressCloudHost(apiUrl)) return undefined
  if (productionBotId === undefined) {
    throw new errors.BotpressCLIError(
      'botruntime Development requires a linked Production target; run `brt link --bot-id <production-runtime-id> --key-stdin` first'
    )
  }
  const value = String(productionBotId)
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new errors.BotpressCLIError(
      `botruntime Production target must be a positive numeric runtime ID, got "${value}"; repair the project with brt link`
    )
  }
  return { [PRODUCTION_BOT_ID_TAG]: value }
}

type AgentDependencySnapshotReport =
  | { status: 'found'; env: typeof ADK_DEV_DEPENDENCY_ENV; path: string }
  | {
      status: 'missing'
      env: typeof ADK_DEV_DEPENDENCY_ENV
      path: string
      warning: string
    }

type AgentDependencyReport = {
  snapshot: AgentDependencySnapshotReport
  statuses: DependencyStatus[]
  issues: DependencyReadinessIssue[]
  revisions: { snapshotBotUpdatedAt?: string; cloudBotUpdatedAt?: string }
  ok: boolean
}

type RequestedReadinessIntegration = {
  id?: string
  name?: string
  version?: string
}

function readinessContractError(detail: string): errors.BotpressCLIError {
  return new errors.BotpressCLIError(
    `dev readiness response violates the required bot.devReadiness.schemaVersion=1 contract: ${detail}`
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeBindingAlias(alias: string): boolean {
  return (
    alias.length > 0 &&
    alias.trim() === alias &&
    !['__proto__', 'prototype', 'constructor'].includes(alias) &&
    !/[\u0000-\u001f\u007f]/.test(alias)
  )
}

function isIntegrationInstanceAlias(alias: string): boolean {
  return alias.length >= 2 && alias.length <= 100 && INTEGRATION_INSTANCE_ALIAS_RE.test(alias)
}

function parseReadinessItems(
  value: unknown,
  path: string,
  type: 'integration' | 'plugin'
): Record<string, CloudReadinessDependency> {
  if (!isRecord(value)) throw readinessContractError(`${path} must be an object`)
  const items: Record<string, CloudReadinessDependency> = {}
  const stringFields = [
    'id',
    'installationId',
    'name',
    'version',
    'configurationType',
    'configurationRevision',
    'status',
    'statusReason',
  ] as const
  for (const alias of Object.keys(value).sort()) {
    if (
      (type === 'plugin' && (!CANONICAL_PLUGIN_ALIAS_RE.test(alias) || ['prototype', 'constructor'].includes(alias))) ||
      (type === 'integration' && !isSafeBindingAlias(alias))
    ) {
      throw readinessContractError(`${path} contains an invalid alias`)
    }
    const raw = value[alias]
    if (!isRecord(raw)) throw readinessContractError(`${path}.${alias} must be an object`)
    for (const field of stringFields) {
      if (raw[field] !== undefined && typeof raw[field] !== 'string') {
        throw readinessContractError(`${path}.${alias}.${field} must be a string`)
      }
    }
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
      throw readinessContractError(`${path}.${alias}.enabled must be a boolean`)
    }
    if (type === 'integration') {
      for (const field of [
        'id',
        'installationId',
        'name',
        'version',
        'configurationType',
        'configurationRevision',
        'status',
      ] as const) {
        if (typeof raw[field] !== 'string' || raw[field] === '') {
          throw readinessContractError(`${path}.${alias}.${field} must be a non-empty string`)
        }
      }
      if (typeof raw.enabled !== 'boolean') {
        throw readinessContractError(`${path}.${alias}.enabled must be a boolean`)
      }
      if (typeof raw.statusReason !== 'string') {
        throw readinessContractError(`${path}.${alias}.statusReason must be a string`)
      }
      if (raw.configurationType !== 'manual') {
        throw readinessContractError(`${path}.${alias}.configurationType must be manual`)
      }
      if (!['pending', 'registered', 'failed'].includes(String(raw.status))) {
        throw readinessContractError(`${path}.${alias}.status must be pending, registered, or failed`)
      }
    }
    if (type === 'plugin') {
      const fields = Object.keys(raw).sort()
      const canonicalFields = ['configuration', 'enabled', 'id', 'integrations', 'interfaces', 'name', 'version']
      if (!isEqual(fields, canonicalFields)) {
        throw readinessContractError(
          `${path}.${alias} must contain exactly ${canonicalFields.join(', ')}; received ${fields.join(', ')}`
        )
      }
      for (const field of ['id', 'name', 'version'] as const) {
        if (typeof raw[field] !== 'string' || raw[field] === '') {
          throw readinessContractError(`${path}.${alias}.${field} must be a non-empty string`)
        }
      }
      if (typeof raw.enabled !== 'boolean') {
        throw readinessContractError(`${path}.${alias}.enabled must be a boolean`)
      }
      if (!isRecord(raw.configuration)) {
        throw readinessContractError(`${path}.${alias}.configuration must be an object`)
      }
      if (!isRecord(raw.interfaces)) {
        throw readinessContractError(`${path}.${alias}.interfaces must be an object`)
      }
      if (!isRecord(raw.integrations)) {
        throw readinessContractError(`${path}.${alias}.integrations must be an object`)
      }
      if (!/^[1-9][0-9]*$/.test(raw.id as string)) {
        throw readinessContractError(`${path}.${alias}.id must be a canonical positive integer string`)
      }
      const dependencyAliases = new Set<string>()
      for (const [interfaceAlias, mapping] of Object.entries(raw.interfaces)) {
        if (!isSafeBindingAlias(interfaceAlias)) {
          throw readinessContractError(`${path}.${alias}.interfaces contains an invalid alias`)
        }
        if (!isRecord(mapping)) {
          throw readinessContractError(`${path}.${alias}.interfaces.${interfaceAlias} must be an object`)
        }
        if (!isEqual(Object.keys(mapping).sort(), ['integrationAlias', 'integrationId', 'integrationInterfaceAlias'])) {
          throw readinessContractError(`${path}.${alias}.interfaces.${interfaceAlias} is noncanonical`)
        }
        if (typeof mapping.integrationAlias !== 'string' || !isIntegrationInstanceAlias(mapping.integrationAlias)) {
          throw readinessContractError(`${path}.${alias}.interfaces.${interfaceAlias}.integrationAlias is invalid`)
        }
        for (const field of ['integrationId', 'integrationInterfaceAlias'] as const) {
          if (typeof mapping[field] !== 'string' || mapping[field] === '') {
            throw readinessContractError(
              `${path}.${alias}.interfaces.${interfaceAlias}.${field} must be a non-empty string`
            )
          }
        }
        if (!isSafeBindingAlias(mapping.integrationInterfaceAlias as string)) {
          throw readinessContractError(
            `${path}.${alias}.interfaces.${interfaceAlias}.integrationInterfaceAlias is invalid`
          )
        }
        dependencyAliases.add(interfaceAlias)
      }
      for (const [integrationAlias, mapping] of Object.entries(raw.integrations)) {
        if (!isSafeBindingAlias(integrationAlias)) {
          throw readinessContractError(`${path}.${alias}.integrations contains an invalid alias`)
        }
        if (dependencyAliases.has(integrationAlias)) {
          throw readinessContractError(
            `${path}.${alias}.${integrationAlias} is duplicated across interfaces and integrations`
          )
        }
        if (!isRecord(mapping)) {
          throw readinessContractError(`${path}.${alias}.integrations.${integrationAlias} must be an object`)
        }
        if (!isEqual(Object.keys(mapping).sort(), ['integrationAlias', 'integrationId'])) {
          throw readinessContractError(`${path}.${alias}.integrations.${integrationAlias} is noncanonical`)
        }
        if (
          typeof mapping.integrationId !== 'string' ||
          mapping.integrationId === '' ||
          typeof mapping.integrationAlias !== 'string' ||
          !isIntegrationInstanceAlias(mapping.integrationAlias)
        ) {
          throw readinessContractError(`${path}.${alias}.integrations.${integrationAlias} is invalid`)
        }
      }
    }
    if (typeof raw.configurationRevision === 'string' && !/^sha256:[0-9a-f]{64}$/.test(raw.configurationRevision)) {
      throw readinessContractError(`${path}.${alias}.configurationRevision must be sha256:<64 lowercase hex>`)
    }
    items[alias] = raw as CloudReadinessDependency
  }
  return items
}

function parseReadinessProjection(
  value: unknown,
  path: string,
  items: Record<string, CloudReadinessDependency> | undefined
): CloudReadinessProjection {
  if (!isRecord(value)) throw readinessContractError(`${path} must be an object`)
  if (value.authority === 'authoritative') {
    if (typeof value.source !== 'string' || value.source === '') {
      throw readinessContractError(`${path}.source must identify the authoritative source`)
    }
    if (path.endsWith('.integrations') && value.source !== 'integration_installation') {
      throw readinessContractError(`${path}.source must be integration_installation`)
    }
    if (path.endsWith('.plugins') && value.source !== 'bot_definition_plugins') {
      throw readinessContractError(`${path}.source must be bot_definition_plugins`)
    }
    if (items === undefined) {
      throw readinessContractError(`${path} is authoritative but the corresponding bot collection is missing`)
    }
    return {
      authority: 'authoritative',
      source: value.source,
      items,
    }
  }
  if (value.authority === 'unknown') {
    if (typeof value.reason !== 'string' || value.reason === '') {
      throw readinessContractError(`${path}.reason must explain unknown authority`)
    }
    return {
      authority: 'unknown',
      reason: value.reason,
    }
  }
  throw readinessContractError(`${path}.authority must be authoritative or unknown`)
}

function parseRuntimeContract(value: unknown): RuntimeContractReadiness {
  try {
    return parseServerRuntimeContract(value)
  } catch (thrown) {
    if (thrown instanceof RuntimeContractError) throw readinessContractError(thrown.message)
    throw thrown
  }
}

function parseCloudDependencyReadiness(
  bot: DevBotReadinessBot
): CloudDependencyReadiness & { runtimeContract: RuntimeContractReadiness } {
  if (!isRecord(bot.devReadiness) || bot.devReadiness.schemaVersion !== 1) {
    throw readinessContractError('schemaVersion must equal 1')
  }
  if (bot.updatedAt !== undefined && typeof bot.updatedAt !== 'string') {
    throw readinessContractError('bot.updatedAt must be a string when present')
  }
  const last = bot.devReadiness.lastDevDeployment
  if (!isRecord(last)) throw readinessContractError('bot.devReadiness.lastDevDeployment must be an object')
  const lastDevDeployment = (() => {
    if (last.authority === 'unknown') {
      if (typeof last.reason !== 'string' || last.reason === '') {
        throw readinessContractError('bot.devReadiness.lastDevDeployment.reason must explain unknown authority')
      }
      return { authority: 'unknown' as const, reason: last.reason }
    }
    if (last.authority === 'authoritative') {
      if (typeof last.revision !== 'string' || last.revision === '') {
        throw readinessContractError('bot.devReadiness.lastDevDeployment.revision must be a non-empty string')
      }
      return { authority: 'authoritative' as const, revision: last.revision }
    }
    throw readinessContractError('bot.devReadiness.lastDevDeployment.authority must be authoritative or unknown')
  })()
  const integrationItems = parseReadinessItems(bot.integrations, 'bot.integrations', 'integration')
  const pluginMetadata = bot.devReadiness.plugins
  const pluginItems =
    isRecord(pluginMetadata) && pluginMetadata.authority === 'authoritative'
      ? parseReadinessItems(bot.plugins, 'bot.plugins', 'plugin')
      : undefined
  return {
    ...(bot.updatedAt ? { botUpdatedAt: bot.updatedAt } : {}),
    integrations: parseReadinessProjection(
      bot.devReadiness.integrations,
      'bot.devReadiness.integrations',
      integrationItems
    ),
    plugins: parseReadinessProjection(bot.devReadiness.plugins, 'bot.devReadiness.plugins', pluginItems),
    lastDevDeployment,
    runtimeContract: parseRuntimeContract(bot.devReadiness.runtimeContract),
  }
}

export type DevCommandDefinition = typeof commandDefinitions.dev
export class DevCommand extends ProjectCommand<DevCommandDefinition> {
  private _initialDef: ProjectDefinition | undefined = undefined
  private _deployedIntegrationName: string | undefined = undefined
  private _cacheDevRequestBody: apiUtils.UpdateBotRequestBody | apiUtils.UpdateIntegrationRequestBody | undefined
  private _buildContext: utils.esbuild.BuildCodeContext
  private _afterInitialDevBotDeploy: (() => Promise<void>) | undefined
  private _productionBotId: string | undefined

  public constructor(...args: ConstructorParameters<typeof ProjectCommand<DevCommandDefinition>>) {
    super(...args)
    this._buildContext = new utils.esbuild.BuildCodeContext()
  }

  protected override async bootstrap(): Promise<void> {
    this._rejectLegacyAdkDeployLoop()
    // `--check` is a deterministic read-only probe. GlobalCommand.bootstrap
    // performs an unrelated public-registry version lookup, so skip it here;
    // readiness must contact only the authoritative dev target.
    if (this.argv.check) return
    await super.bootstrap()
  }

  private _rejectLegacyAdkDeployLoop(): void {
    if (this.argv.adk) {
      throw new errors.BotpressCLIError(
        '`brt dev --adk` no longer deploys cloud bots; use `brt deploy --adk --watch` for the explicit cloud redeploy loop.'
      )
    }
  }

  public async run(): Promise<void> {
    // Keep direct programmatic callers as safe as the normal handler/bootstrap path.
    this._rejectLegacyAdkDeployLoop()

    this.logger.warn('This command is experimental and subject to breaking changes without notice.')

    if (this.argv.check) {
      return this._runDevCheck()
    }

    // An agent project has exactly one dev semantic: generate its synthetic bot
    // and run that bot through the dev-bot/tunnel path. Cloud deployment lives
    // exclusively under the explicitly named `brt deploy --adk` command.
    if (adkBundle.isAgentProject(this.projectPaths.abs.workDir)) {
      const toolchain = inspectPlatformToolchain(this.projectPaths.abs.workDir)
      assertPlatformToolchainCompatible(toolchain)
      return this._runAgentTunnelDev()
    }

    const watchEnabled = this.argv.watch !== false
    let api = this.argv.local
      ? await this._resolveClassicLocalClient(this.projectPaths.abs.workDir)
      : await this.ensureLoginAndCreateClient(this.argv)

    const { projectType, resolveProjectDefinition } = this.readProjectDefinitionFromFS()
    if (projectType === 'interface') {
      throw new errors.BotpressCLIError('This feature is not available for interfaces.')
    }
    const projectDef = await resolveProjectDefinition()
    this._initialDef = projectDef

    if (projectDef.type === 'integration') {
      const handleResult = await this.manageWorkspaceHandle(api, projectDef)
      if (!handleResult) return
      if (handleResult.workspaceId) {
        api = api.switchWorkspace(handleResult.workspaceId)
      }
      this._deployedIntegrationName = handleResult.definition.name
    }

    let env: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
    if (this._initialDef.type === 'integration') {
      env = { ...env, BP_API_URL: api.url, BP_TOKEN: api.token }
    }

    const defaultPort = this._initialDef.type === 'integration' ? DEFAULT_INTEGRATION_PORT : DEFAULT_BOT_PORT
    if (this._initialDef.type === 'integration' || this._initialDef.type === 'bot') {
      const knownSecrets = await this._readKnownSecretsFromCache()
      let secretEnvVariables = await this.promptSecrets(this._initialDef.definition, this.argv, {
        knownSecrets: Object.keys(knownSecrets),
        formatEnv: true,
      })
      secretEnvVariables = {
        ...this._applyPrefixToSecrets(knownSecrets),
        ...secretEnvVariables,
      }
      const nonNullSecretEnvVariables = utils.records.filterValues(secretEnvVariables, utils.guards.is.notNull)

      if (!this.argv.noSecretCaching) {
        await this._writeKnownSecretsToCache(secretEnvVariables)
      }

      env = { ...env, ...nonNullSecretEnvVariables }
    }

    const port = this.argv.port ?? defaultPort

    const urlParseResult = utils.url.parse(this.argv.tunnelUrl)
    if (urlParseResult.status === 'error') {
      throw new errors.BotpressCLIError(`Invalid tunnel URL: ${urlParseResult.error}`)
    }

    const cachedTunnelId = await this.projectCache.get('tunnelId')

    let tunnelId: string
    if (this.argv.tunnelId) {
      tunnelId = this.argv.tunnelId
    } else if (cachedTunnelId) {
      tunnelId = cachedTunnelId
    } else {
      tunnelId = uuid.v4()
    }

    if (cachedTunnelId !== tunnelId) {
      await this.projectCache.set('tunnelId', tunnelId)
    }

    const { url: parsedTunnelUrl } = urlParseResult
    const isSecured = parsedTunnelUrl.protocol === 'https' || parsedTunnelUrl.protocol === 'wss'

    const wsTunnelUrl: string = utils.url.format({
      ...parsedTunnelUrl,
      protocol: isSecured ? 'wss' : 'ws',
    })
    const httpTunnelUrl: string = utils.url.format({
      ...parsedTunnelUrl,
      protocol: isSecured ? 'https' : 'http',
      path: `/${tunnelId}`,
    })

    let worker: Worker | undefined = undefined
    const traceIngest = this._initialDef.type === 'bot' ? await DevTraceIngestServer.start() : undefined

    const supervisor = new utils.tunnel.TunnelSupervisor(wsTunnelUrl, tunnelId, this.logger)
    supervisor.events.on('connected', ({ tunnel }) => {
      // prevents the tunnel from closing due to inactivity
      const timer = setInterval(() => {
        if (tunnel.closed) {
          return handleClose()
        }
        tunnel.hello()
      }, TUNNEL_HELLO_INTERVAL)
      const handleClose = (): void => clearInterval(timer)
      tunnel.events.on('close', handleClose)

      tunnel.events.on('request', (req) => {
        if (!worker) {
          this.logger.debug('Worker not ready yet, ignoring request')
          tunnel.send({
            requestId: req.id,
            status: 503,
            body: 'Worker not ready yet',
          })
          return
        }

        void this._forwardTunnelRequest(`http://localhost:${port}`, req)
          .then((res) => {
            tunnel.send(res)
          })
          .catch((thrown) => {
            const err = errors.BotpressCLIError.wrap(
              thrown,
              `An error occurred while handling request ${req.method} ${req.path}`
            )
            this.logger.error(err.message)
            this.logger.debug(errors.BotpressCLIError.fullStack(err))
            tunnel.send({
              requestId: req.id,
              status: 500,
              body: 'Internal error while handling request',
            })
          })
      })
    })

    supervisor.events.on('manuallyClosed', () => {
      this.logger.debug('Tunnel manually closed')
    })

    try {
      await this._runBuild(watchEnabled)
      worker = await this._spawnWorkerForResolvedDevTarget(api, httpTunnelUrl, env, port, traceIngest?.url)
    } catch (thrown) {
      await traceIngest?.close()
      throw thrown
    }

    // Order matters: register the dev bot (createBot({dev:true,url})) BEFORE
    // connecting the tunnel. cloudapi only forwards /run/<tunnelId> to the tunnel
    // once the dev bot for that tunnel id exists (the isTunnelBot gate); starting
    // the tunnel first makes the very first WS handshake 404 against a not-yet-
    // registered tunnel id. So deploy, THEN supervisor.start() (which now also
    // carries a bounded initial-connect retry to bridge the server's reconcile
    // window). A failure in either tears the worker down.
    try {
      await this._deploy(api, httpTunnelUrl)
      await supervisor.start()
    } catch (thrown) {
      if (worker.running) {
        await worker.kill()
      }
      await traceIngest?.close()
      throw errors.BotpressCLIError.wrap(thrown, 'An error occurred while starting the dev server')
    }

    try {
      let watcher: Awaited<ReturnType<typeof utils.filewatcher.FileWatcher.watch>> | undefined
      if (!watchEnabled) {
        await this._disposeBuildResources({ stopEsbuild: true })
        await Promise.race([worker.wait(), supervisor.wait()])
      } else {
        watcher = await utils.filewatcher.FileWatcher.watch(
          this.argv.workDir,
          async (events) => {
            if (!worker) {
              this.logger.debug('Worker not ready yet, ignoring file change event')
              return
            }

            const typescriptEvents = events
              .filter((e) => !e.path.startsWith(this.projectPaths.abs.outDir))
              .filter((e) => pathlib.extname(e.path) === '.ts')

            const packageJsonEvents = events
              .filter((e) => !e.path.startsWith(this.projectPaths.abs.outDir))
              .filter((e) => pathlib.basename(e.path) === 'package.json')

            const distEvents = events.filter((e) => e.path.startsWith(this.projectPaths.abs.distDir))

            if (typescriptEvents.length > 0 || packageJsonEvents.length > 0) {
              this.logger.log('Changes detected, rebuilding')
              await this._restart(api, worker, httpTunnelUrl)
            } else if (distEvents.length > 0) {
              this.logger.log('Changes detected in output directory, reloading worker')
              await worker.reload()
            }
          },
          {
            debounceMs: FILEWATCHER_DEBOUNCE_MS,
          }
        )

        await Promise.race([worker.wait(), watcher.wait(), supervisor.wait()])
      }

      if (worker.running) {
        await worker.kill()
      }
      await watcher?.close()
      supervisor.close()
    } catch (thrown) {
      throw errors.BotpressCLIError.wrap(thrown, 'An error occurred while running the dev server')
    } finally {
      if (worker.running) {
        await worker.kill()
      }
      await this._disposeBuildResources()
      await traceIngest?.close()
    }
  }

  // In-process dependency installer for the agent bot generator: drives brt's
  // OWN native AddCommand as a plain function call instead of spawning a
  // provisioned brt binary to add each integration/plugin/interface into
  // the generated bot's bp_modules. Mirrors deploy-command.ts's own
  // _buildAdkBundle installer construction exactly (see the comment there for
  // the full rationale); replicated here rather than shared because the two
  // callers are on unrelated class hierarchies (DevCommand vs DeployCommand)
  // and neither project-command.ts (their common ancestor) nor adk-bundle.ts
  // can import AddCommand without creating a circular import
  // (add-command.ts -> project-command.ts).
  private _buildAdkDependencyInstaller(): adkBundle.DependencyInstaller {
    return async ({ resource, botPath, workspaceId, credentials }) => {
      const addArgv: CommandArgv<AddCommandDefinition> = {
        ...this.argv,
        profile: undefined,
        packageRef: resource,
        installPath: botPath,
        useDev: false,
        alias: undefined,
        confirm: true,
        apiUrl: credentials.apiUrl,
        token: credentials.token,
        workspaceId,
      }
      await new AddCommand(this.api, this.prompt, this.logger, addArgv).run()
    }
  }

  private async _resolveAgentDevConnection(
    dir: string
  ): Promise<{ token: string; apiUrl: string; workspaceId: string }> {
    const agentLocalInfo = agentLink.readAgentLocalInfo(dir)
    const { name: profileName, profile } = await cloudProfileResolve.resolveProfile({
      argvProfile: this.argv.profile,
      getActiveProfile: () => this.globalCache.get('activeProfile'),
      readProfile: (name) => this.readProfileFromFS(name),
    })
    const selectedApiUrl = cloudProfileResolve.resolveApiUrl(this.argv.apiUrl, profile)
    cloudProfileResolve.assertProfileAuthority(
      'command target override',
      {
        apiUrl: selectedApiUrl,
        workspaceId: this.argv.workspaceId,
      },
      profile
    )
    if (this.argv.local && !agentLocalInfo.apiUrl) {
      throw new errors.BotpressCLIError(
        'agent.local.json has no apiUrl — brt dev --local cannot use profile stack coordinates'
      )
    }
    if (this.argv.local && !agentLocalInfo.workspaceId) {
      throw new errors.BotpressCLIError(
        'agent.local.json has no workspaceId — brt dev --local cannot use profile stack coordinates'
      )
    }
    if (this.argv.local) {
      cloudProfileResolve.assertProfileAuthority('agent.local.json', agentLocalInfo, profile, {
        requireCoordinates: true,
      })
    }
    const apiUrl = this.argv.local ? agentLocalInfo.apiUrl!.replace(/\/+$/, '') : selectedApiUrl
    const workspaceId = this.argv.local ? agentLocalInfo.workspaceId : (this.argv.workspaceId ?? profile.workspaceId)
    if (!workspaceId) {
      throw new errors.BotpressCLIError(
        `profile "${profileName}" has no workspaceId — re-run \`brt login\` before \`brt dev\``
      )
    }
    return {
      token: this.argv.local ? profile.token : (this.argv.token ?? profile.token),
      apiUrl,
      workspaceId,
    }
  }

  private async _resolveClassicLocalClient(dir: string): Promise<apiUtils.ApiClient> {
    const local = cloudLink.loadLinkIfPresent(dir, 'local')
    const { profile } = await cloudProfileResolve.resolveProfile({
      argvProfile: this.argv.profile,
      getActiveProfile: () => this.globalCache.get('activeProfile'),
      readProfile: (name) => this.readProfileFromFS(name),
    })
    const selectedApiUrl = cloudProfileResolve.resolveApiUrl(this.argv.apiUrl, profile)
    cloudProfileResolve.assertProfileAuthority(
      'command target override',
      {
        apiUrl: selectedApiUrl,
        workspaceId: this.argv.workspaceId,
      },
      profile
    )
    cloudProfileResolve.assertProfileAuthority('bot.local.json', local ?? {}, profile, {
      requireCoordinates: true,
    })
    return this.api.newClient(
      {
        apiUrl: local!.apiUrl!.replace(/\/+$/, ''),
        workspaceId: String(local!.workspaceId),
        token: profile.token,
      },
      this.logger
    )
  }

  private _isNotFoundError(thrown: unknown): boolean {
    return (
      (client.isApiError(thrown) && thrown.code === 404) ||
      (thrown instanceof errors.HTTPError && thrown.status === 404)
    )
  }

  private async _ensureAgentDevTarget(
    dir: string,
    credentials: { token: string; apiUrl: string; workspaceId: string }
  ): Promise<DevBotTarget> {
    const local = agentLink.readAgentLocalInfo(dir)
    const cached = agentLink.resolveAgentDevTargetForStack(local, credentials)
    const legacyRuntimeHint = cached ? undefined : agentLink.getLegacyAgentDevRuntimeHint(local)
    const explicitRuntimeBotId = this.argv.tunnelId
    const runtimeBotId = explicitRuntimeBotId ?? cached?.runtimeBotId ?? legacyRuntimeHint ?? uuid.v4()
    const cachedTarget = cached && runtimeBotId === cached.runtimeBotId ? cached.targetBotId : undefined
    const api = this.api.newClient(credentials, this.logger)
    const productionTags = developmentProductionTags(
      credentials.apiUrl,
      agentLink.readAgentInfoIfPresent(dir)?.botId
    )
    let bot: client.Bot | undefined

    if (
      runtimeBotId === cached?.runtimeBotId ||
      runtimeBotId === legacyRuntimeHint ||
      (explicitRuntimeBotId !== undefined && explicitRuntimeBotId === local.devId)
    ) {
      try {
        bot = (await api.client.getBot({ id: runtimeBotId })).bot
      } catch (thrown) {
        if (!this._isNotFoundError(thrown)) {
          throw errors.BotpressCLIError.wrap(thrown, `Could not resolve dev bot "${runtimeBotId}"`)
        }
      }
    }

    let target: DevBotTarget
    if (bot && productionTags) {
      // botruntime createBot is idempotent by tunnel ID. Repeating it proves
      // that the cached Development still belongs to this Production project.
      const response = await api.client
        .createBot({
          dev: true,
          url: this._devTunnelHttpUrl(runtimeBotId),
          tags: productionTags,
        })
        .catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, 'Could not link agent dev bot to production')
        })
      bot = response.bot
      target = resolveDevBotTarget(bot, runtimeBotId, cachedTarget)
    } else if (bot) {
      target = resolveDevBotTarget(bot, runtimeBotId, cachedTarget)
    } else {
      const response = await api.client
        .createBot({
          dev: true,
          url: this._devTunnelHttpUrl(runtimeBotId),
          ...(productionTags ? { tags: productionTags } : {}),
        })
        .catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, 'Could not provision agent dev bot')
        })
      target = resolveDevBotTarget(response.bot, runtimeBotId)
    }

    agentLink.writeAgentLocalDevTarget(
      dir,
      target.runtimeBotId,
      target.targetBotId,
      credentials.apiUrl,
      credentials.workspaceId
    )
    return target
  }

  // ---------------------------------------------------------------------
  // brt dev (default, agent.config.ts auto-detected) — the agent TUNNEL dev
  // loop: "local-like-Botpress" dev via cloudapi's dev-bot/tunnel surface. An
  // agent project has no bot.definition.ts, so it cannot be read directly by
  // the classic bot/integration flow above. Instead this:
  //   1. generates the synthetic classic bot at .adk/bot in-process (the same
  //      @holocronlab/botruntime-adk generator `brt deploy --adk` uses — see
  //      deploy-command.ts's _buildAdkBundle), and
  //   2. runs the CLASSIC tunnel/worker dev server (the code above in this
  //      same class) against .adk/bot, in-process, by nesting a DevCommand
  //      with workDir=.adk/bot and adk:false. The nested command sees a
  //      non-agent (classic) project there and takes the classic path
  //      (createBot({dev:true,url}) + updateBot + tables + tunnel + Worker +
  //      its own file-watch on .adk/bot) — no recursion, and NO wire change to
  //      _deployDevBot/createBot (the server still derives id+type from the
  //      tunnel URL; neither is sent).
  // An OUTER regen-watch on the agent SOURCE (excluding .adk/, .brt/,
  // node_modules) re-generates .adk/bot on every agent-source change; the
  // NESTED DevCommand's own watcher then rebuilds+redeploys as usual, exactly
  // as if a developer had hand-edited the generated bot. When the nested dev
  // exits (worker/tunnel/watcher done, or an unrecoverable error), the outer
  // watcher is closed and this method returns.
  // ---------------------------------------------------------------------
  private async _runAgentTunnelDev(): Promise<void> {
    const dir = this.projectPaths.abs.workDir
    const watchEnabled = this.argv.watch !== false
    const assertCurrentToolchain = (): void => {
      assertPlatformToolchainCompatible(inspectPlatformToolchain(dir))
    }
    const installer = this._buildAdkDependencyInstaller()
    const credentials = await this._resolveAgentDevConnection(dir)
    const devTarget = await this._ensureAgentDevTarget(dir, credentials)
    const migrationTarget = {
      env: ADK_DEV_DEPENDENCY_ENV,
      apiUrl: credentials.apiUrl,
      workspaceId: credentials.workspaceId,
      botId: devTarget.targetBotId,
    }
    const { migrateFromConfig } = await adkBundle.loadAdkMigrationTools()
    const migrationApi = this.api.newClient(credentials, this.logger)
    await migrateFromConfig({
      projectPath: dir,
      client: migrationApi.client as unknown as Parameters<typeof migrateFromConfig>[0]['client'],
      target: migrationTarget,
      runtimeBotId: devTarget.runtimeBotId,
      authority: this.argv.local
        ? { source: 'agentLocalDev', coordinates: { source: 'link' } }
        : {
            source: 'agentLocalDev',
            coordinates: {
              source: 'attested',
              apiUrl: credentials.apiUrl,
              workspaceId: credentials.workspaceId,
            },
          },
    })
    const generationOptions = (): adkBundle.AgentBotGenerationOptions => ({
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: devTarget.targetBotId,
        runtimeBotId: devTarget.runtimeBotId,
        credentials,
      },
    })

    cloudInfo(`agent dev: generating tunnel bot for ${dir} ...`)
    // Initial generation fails loudly (never a silent no-op): a broken agent
    // project should stop `brt dev` outright instead of starting a tunnel dev
    // session against a bot that was never successfully generated.
    assertCurrentToolchain()
    const botPath = await adkBundle.generateAgentBot(dir, installer, generationOptions()).catch((thrown) => {
      throw errors.BotpressCLIError.wrap(thrown, 'agent dev: initial bot generation failed')
    })
    // Repair the tunnelId the agent generator's own DevIdManager.restoreDevId()
    // just dropped from the nested project cache (see adk-dev-id.ts) BEFORE the
    // nested classic DevCommand below reads its tunnelId — so a previously
    // persisted dev bot's tunnel is reused instead of a fresh uuid being minted.
    adkDevId.restoreDevTunnelId(botPath, this.logger)

    let regenerating = false
    let regenDirty = false
    // A file change during regeneration queues exactly one additional pass,
    // preventing concurrent writes to the generated bot.
    const regenerate = async (): Promise<void> => {
      if (regenerating) {
        regenDirty = true
        return
      }
      regenerating = true
      try {
        do {
          regenDirty = false
          // Lockfiles are watched as source inputs. Re-check the physical
          // graph on every regeneration so an install performed while dev is
          // running cannot silently rebuild and redeploy a mixed toolchain.
          assertCurrentToolchain()
          // A newly provisioned nested dev bot is persisted before choosing
          // the next config target; agent.local.json remains the sole source.
          adkDevId.preserveDevId(dir, botPath, this.logger)
          await adkBundle.generateAgentBot(dir, installer, generationOptions())
          // Same repair as the initial generation above: every regeneration
          // re-runs the agent generator's restoreDevId(), which drops tunnelId
          // again whenever agent.local.json already has a devId.
          adkDevId.restoreDevTunnelId(botPath, this.logger)
        } while (regenDirty)
      } finally {
        regenerating = false
      }
    }

    let watcher: Awaited<ReturnType<typeof utils.filewatcher.FileWatcher.watch>> | undefined
    if (watchEnabled) {
      watcher = await utils.filewatcher.FileWatcher.watch(
        dir,
        async (events) => {
          if (
            !events.some((e) =>
              adkBundle.isAgentSourceChange(dir, e.path, {
                dependencyEnv: 'dev',
              })
            )
          )
            return
          this.logger.log('Agent source changed, regenerating tunnel bot')
          try {
            await regenerate()
          } catch (thrown) {
            // Loud, never silent: a transient generate error (e.g. a syntax
            // error mid-edit) must not kill the dev session, but it must be
            // impossible to miss either.
            const err = errors.BotpressCLIError.wrap(thrown, 'agent dev: regenerate failed')
            this.logger.error(err.message)
            this.logger.debug(errors.BotpressCLIError.fullStack(err))
          }
        },
        { debounceMs: FILEWATCHER_DEBOUNCE_MS }
      )
    }

    // Resolve the stack exactly once in the outer agent command. The nested
    // classic command must not re-read a profile or global cache and silently
    // choose a different host/workspace for the same dev target.
    const nestedArgv: CommandArgv<DevCommandDefinition> = {
      ...this.argv,
      workDir: botPath,
      adk: false,
      local: false,
      profile: undefined,
      apiUrl: credentials.apiUrl,
      workspaceId: credentials.workspaceId,
      token: credentials.token,
      tunnelId: devTarget.runtimeBotId,
    }

    cloudInfo(`agent dev: starting classic tunnel dev on ${botPath} ...`)
    const nestedCommand = new DevCommand(this.api, this.prompt, this.logger, nestedArgv)
    nestedCommand._productionBotId = agentLink.readAgentInfoIfPresent(dir)?.botId
    let parentSnapshotRefresh: Promise<void> | undefined
    nestedCommand._afterInitialDevBotDeploy = async () => {
      parentSnapshotRefresh ??= this._refreshAgentDevSnapshot(dir, credentials, devTarget)
      await parentSnapshotRefresh
    }
    try {
      await nestedCommand.run()
    } finally {
      await watcher?.close()
      // Persist the (possibly newly-minted) dev bot id to agent.local.json for
      // the NEXT `brt dev` run — see adk-dev-id.ts. Best-effort: this must not
      // mask whatever the nested dev's own run() threw/returned above.
      adkDevId.preserveDevId(dir, botPath, this.logger)
    }
  }

  private async _refreshAgentDevSnapshot(
    dir: string,
    credentials: { token: string; apiUrl: string; workspaceId: string },
    target: DevBotTarget
  ): Promise<void> {
    const { refreshCompletedDependencySnapshot } = await adkBundle.loadAdkDependencyRefreshTools()
    const dependencyTarget = {
      env: ADK_DEV_DEPENDENCY_ENV,
      apiUrl: credentials.apiUrl,
      workspaceId: credentials.workspaceId,
      botId: target.targetBotId,
    }
    const api = this.api.newClient(credentials, this.logger)
    await refreshCompletedDependencySnapshot({
      projectPath: dir,
      client: api.client as any,
      target: dependencyTarget,
      runtimeBotId: target.runtimeBotId,
    })
  }

  private _restart = async (api: apiUtils.ApiClient, worker: Worker, tunnelUrl: string) => {
    try {
      await this._runBuild()
    } catch (thrown) {
      const error = errors.BotpressCLIError.wrap(thrown, 'Build failed')
      this.logger.error(error.message)
      this.logger.debug(errors.BotpressCLIError.fullStack(error))
      return
    }

    await worker.reload()
    await this._deploy(api, tunnelUrl)
  }

  private async _runDevCheck(): Promise<void> {
    const dir = this.projectPaths.abs.workDir
    const isAgent = adkBundle.isAgentProject(dir)
    const localToolchain = inspectPlatformToolchain(dir)
    assertPlatformToolchainCompatible(localToolchain)
    const linkEnv: cloudLink.LinkEnv = this.argv.local ? 'local' : 'prod'
    const legacyLink = cloudLink.loadLinkIfPresent(dir, linkEnv)
    const agentLocalInfo = agentLink.readAgentLocalInfo(dir)

    let strictLocal: { apiUrl: string; workspaceId: string } | undefined
    if (this.argv.local) {
      const localStack = isAgent
        ? {
            fileName: 'agent.local.json',
            apiUrl: agentLocalInfo.apiUrl,
            workspaceId: agentLocalInfo.workspaceId,
          }
        : {
            fileName: 'bot.local.json',
            apiUrl: legacyLink?.apiUrl,
            workspaceId: legacyLink?.workspaceId === undefined ? undefined : String(legacyLink.workspaceId),
          }
      if (!localStack.apiUrl) {
        throw new errors.BotpressCLIError(
          `${localStack.fileName} has no apiUrl — brt dev --check --local cannot use profile stack coordinates`
        )
      }
      if (!localStack.workspaceId) {
        throw new errors.BotpressCLIError(
          `${localStack.fileName} has no workspaceId — brt dev --check --local cannot use profile stack coordinates`
        )
      }
      strictLocal = {
        apiUrl: localStack.apiUrl.replace(/\/+$/, ''),
        workspaceId: localStack.workspaceId,
      }
    }

    const { name: profileName, profile } = await cloudProfileResolve.resolveProfile({
      argvProfile: this.argv.profile,
      getActiveProfile: () => this.globalCache.peek('activeProfile'),
      readProfile: (name) => this.readProfileFromFS(name),
    })
    const selectedApiUrl = cloudProfileResolve.resolveApiUrl(this.argv.apiUrl, profile)
    cloudProfileResolve.assertProfileAuthority(
      'command target override',
      {
        apiUrl: selectedApiUrl,
        workspaceId: this.argv.workspaceId,
      },
      profile
    )
    if (this.argv.local) {
      cloudProfileResolve.assertProfileAuthority(
        isAgent ? 'agent.local.json' : 'bot.local.json',
        strictLocal ?? {},
        profile,
        { requireCoordinates: true }
      )
    }
    const workspaceId = strictLocal?.workspaceId ?? this.argv.workspaceId ?? profile.workspaceId
    if (!workspaceId) {
      throw new errors.BotpressCLIError(
        `profile "${profileName}" and project metadata have no workspaceId — re-run \`brt login\` (dev readiness is workspace-scoped)`
      )
    }

    const apiUrl = strictLocal?.apiUrl ?? selectedApiUrl
    const cached = await this._readCachedDevCheckTarget(isAgent, dir, {
      apiUrl,
      workspaceId,
    })
    const devId = cached.runtimeBotId
    const tunnelId = cached.tunnelId
    const url = this._devTunnelHttpUrl(tunnelId)

    const client = new CloudapiClient(apiUrl, this.argv.local ? profile.token : (this.argv.token ?? profile.token))
    const report = await client.getDevBotTarget(devId, workspaceId).catch((thrown) => {
      if (thrown instanceof errors.HTTPError && thrown.status === 404) {
        throw new errors.BotpressCLIError(
          `dev readiness is unavailable for dev bot "${devId}" at ${apiUrl}. ` +
            `Required server contract: GET /v1/admin/bots/{devId} must return authoritative readiness state.`
        )
      }
      throw errors.BotpressCLIError.wrap(thrown, 'dev readiness check failed')
    })
    const verifiedTarget = resolveDevBotTarget(report.bot, devId, cached.targetBotId)
    const cloudReadiness = parseCloudDependencyReadiness(report.bot)

    await client.requireEvalBotReady(devId).catch((thrown) => {
      if (thrown instanceof errors.HTTPError && isTunnelUnavailableStatus(thrown.status)) {
        throw new errors.BotpressCLIError(
          `development tunnel is not connected for dev bot "${devId}"; start or restart \`brt dev\`, then retry \`brt dev --check\``
        )
      }
      throw errors.BotpressCLIError.wrap(thrown, 'development tunnel readiness check failed')
    })

    const dependencies = isAgent
      ? await this._readAgentDependencyReport(dir, verifiedTarget.targetBotId, apiUrl, workspaceId, cloudReadiness)
      : undefined
    const integrations = isAgent ? {} : await this._readDevCheckRequestedIntegrations()
    const readinessIntegrations = (() => {
      if (cloudReadiness.integrations?.authority === 'authoritative') {
        return cloudReadiness.integrations.items
      }
      if (isAgent) return {}
      throw new errors.BotpressCLIError(
        `Cloud integration state is not authoritative: ${cloudReadiness.integrations?.reason ?? 'missing authority metadata'}`
      )
    })()
    if (!isAgent) {
      const missingReadinessAliases = Object.keys(integrations).filter((alias) => !readinessIntegrations[alias])
      if (missingReadinessAliases.length > 0) {
        throw new errors.BotpressCLIError(
          `dev readiness response did not include integration statuses for: ${missingReadinessAliases.join(', ')}. ` +
            'Required server contract: GET /v1/admin/bots/{devId} must return bot.integrations entries with ' +
            'authoritative bot.devReadiness.integrations metadata.'
        )
      }
    }

    const failed = isAgent ? [] : this._failedReadinessIntegrations(readinessIntegrations, integrations)
    const localEvalManifest = localToolchain.capabilities['evalManifest']
    const cloudRuntime = cloudReadiness.runtimeContract
    const serverEvalManifest =
      cloudRuntime.authority === 'authoritative' ? cloudRuntime.capabilities.evalManifest : undefined
    const evalTransport = {
      ready:
        localEvalManifest !== undefined &&
        serverEvalManifest !== undefined &&
        localEvalManifest === serverEvalManifest,
      integration: 'botruntime/eval (native)',
      localManifestSchema: localEvalManifest ?? null,
      serverManifestSchema: serverEvalManifest ?? null,
      ...(cloudRuntime.authority === 'unknown'
        ? { reason: cloudRuntime.reason }
        : localEvalManifest === undefined
          ? { reason: 'local toolchain does not declare the evalManifest capability' }
          : localEvalManifest !== serverEvalManifest
            ? {
                reason: `eval manifest capability mismatch: local=${localEvalManifest}, server=${serverEvalManifest}`,
              }
            : {}),
    }
    const output = {
      ok: failed.length === 0 && (!dependencies || dependencies.ok) && evalTransport.ready,
      bot: {
        id: report.bot.id,
        dev: report.bot.dev,
        url: report.bot.url ?? url,
      },
      integrations: readinessIntegrations,
      evalTransport,
      toolchain: {
        ready: true,
        capabilities: localToolchain.capabilities,
        packages: localToolchain.packages,
        ...(localToolchain.lockfile ? { lockfile: localToolchain.lockfile } : {}),
      },
      ...(dependencies ? { dependencies } : {}),
    }

    if (this.argv.json) {
      this.logger.json(output)
    } else {
      this.logger.log(`Dev bot: ${output.bot.id}`)
      this.logger.log(`URL: ${output.bot.url}`)
      const entries = Object.entries(output.integrations)
      if (entries.length === 0) {
        this.logger.log('Integrations: none')
      } else {
        this.logger.log('Integrations:')
        for (const [alias, integration] of entries) {
          const status = integration.status ?? 'unknown'
          const reason = integration.statusReason ? ` — ${integration.statusReason}` : ''
          this.logger.log(`  ${alias}: ${status}${reason}`)
        }
      }
      this.logger.log(
        output.evalTransport.ready
          ? `Eval transport: ready (${output.evalTransport.integration}, manifest schema ${output.evalTransport.localManifestSchema})`
          : `Eval transport: not ready (${output.evalTransport.reason ?? 'runtime contract mismatch'})`
      )
      this.logger.log(`Toolchain: ready (${output.toolchain.packages.length} resolved platform packages)`)
      if (dependencies) {
        this._printAgentDependencyReport(dependencies)
      }
    }

    if (dependencies?.snapshot.status === 'missing') {
      throw new errors.BotpressCLIError(dependencies.snapshot.warning)
    }

    if (failed.length > 0) {
      throw new errors.BotpressCLIError(
        `Dev bot is not ready:\n${failed
          .map(
            ({ alias, integration, reason }) =>
              `• ${alias}: ${reason}${integration.statusReason ? ` — ${integration.statusReason}` : ''}`
          )
          .join('\n')}`
      )
    }

    if (!evalTransport.ready) {
      throw new errors.BotpressCLIError(
        `Eval transport is not ready: ${evalTransport.reason ?? 'local and server runtime contracts are incompatible'}`
      )
    }

    if (dependencies && !dependencies.ok) {
      const issueLines = dependencies.issues.map((issue) => `• ${this._formatDependencyIssue(issue)}`)
      const statusLines = this._blockingDependencyStatuses(dependencies.statuses).map(
        (dependency) => `• ${this._formatDependencyStatus(dependency)}`
      )
      throw new errors.BotpressCLIError(
        `Agent dependencies are not ready:\n${(issueLines.length > 0 ? issueLines : statusLines).join('\n')}`
      )
    }
  }

  private async _readAgentDependencyReport(
    dir: string,
    targetBotId: string,
    apiUrl: string,
    workspaceId: string,
    cloud: CloudDependencyReadiness
  ): Promise<AgentDependencyReport> {
    const { DependencySnapshotStore, reconcileDependencyReadiness } = await adkBundle.loadAdkDependencyTools()
    const snapshotStore = new DependencySnapshotStore({ projectPath: dir })
    const snapshotPath = snapshotStore.getSnapshotPath(ADK_DEV_DEPENDENCY_ENV)
    const expectedTarget = {
      env: ADK_DEV_DEPENDENCY_ENV,
      apiUrl,
      workspaceId,
      botId: targetBotId,
    }
    const snapshot = await snapshotStore.read(expectedTarget).catch((thrown) => {
      throw errors.BotpressCLIError.wrap(
        thrown,
        `could not read the agent dependency snapshot at ${snapshotPath}; run \`brt dev\` or refresh dependencies, then retry \`brt dev --check\``
      )
    })
    if (!snapshot) {
      return {
        snapshot: {
          status: 'missing',
          env: ADK_DEV_DEPENDENCY_ENV,
          path: snapshotPath,
          warning:
            `Agent dependency snapshot is missing at ${snapshotPath}. ` +
            'Run `brt dev` or refresh/sync dependencies so .adk/dependencies/dev.json exists, then retry `brt dev --check`.',
        },
        statuses: [],
        issues: [],
        revisions: {
          ...(cloud.botUpdatedAt ? { cloudBotUpdatedAt: cloud.botUpdatedAt } : {}),
        },
        ok: false,
      }
    }
    const reconciliation = await reconcileDependencyReadiness({
      snapshot,
      expectedTarget,
      bpModulesDir: pathlib.join(dir, adkBundle.AGENT_BOT_REL_PATH, 'bp_modules'),
      cloud,
    })
    const statuses = [...reconciliation.statuses].sort((a, b) =>
      `${a.type}:${a.alias}`.localeCompare(`${b.type}:${b.alias}`)
    )
    const issues = [...reconciliation.issues].sort((a, b) =>
      `${a.type ?? ''}:${a.alias ?? ''}:${a.code}:${a.message}`.localeCompare(
        `${b.type ?? ''}:${b.alias ?? ''}:${b.code}:${b.message}`
      )
    )
    return {
      snapshot: {
        status: 'found',
        env: ADK_DEV_DEPENDENCY_ENV,
        path: snapshotPath,
      },
      statuses,
      issues,
      revisions: reconciliation.revisions,
      ok: reconciliation.ok,
    }
  }

  private _printAgentDependencyReport(dependencies: AgentDependencyReport): void {
    this.logger.log(`Dependency snapshot: ${dependencies.snapshot.status} (${dependencies.snapshot.path})`)
    if (dependencies.snapshot.status === 'missing') {
      this.logger.log(`Dependency warning: ${dependencies.snapshot.warning}`)
    }
    if (dependencies.statuses.length === 0) {
      this.logger.log('Dependencies: none')
    } else {
      this.logger.log('Dependencies:')
      for (const dependency of dependencies.statuses) {
        this.logger.log(`  ${this._formatDependencyStatus(dependency)}`)
      }
    }
    if (dependencies.issues.length > 0) {
      this.logger.log('Dependency issues:')
      for (const issue of dependencies.issues) {
        this.logger.log(`  ${this._formatDependencyIssue(issue)}`)
      }
    }
  }

  private _blockingDependencyStatuses(dependencies: DependencyStatus[]): DependencyStatus[] {
    return dependencies.filter(
      (dependency) => dependency.enabled && dependency.state !== 'available' && dependency.state !== 'disabled'
    )
  }

  private _formatDependencyStatus(dependency: DependencyStatus): string {
    const missingFields = dependency.missingFields?.length ? ` missing=${dependency.missingFields.join(',')}` : ''
    const reason = dependency.reason ? ` — ${dependency.reason}` : ''
    return `${dependency.type} ${dependency.alias}: ${dependency.state}${missingFields}${reason}`
  }

  private _formatDependencyIssue(issue: DependencyReadinessIssue): string {
    const dependency = issue.type && issue.alias ? ` ${issue.type} ${issue.alias}` : ''
    return `${issue.code}${dependency}: ${issue.message}`
  }

  private async _readCachedDevCheckTarget(
    isAgent: boolean,
    dir: string,
    selected: { apiUrl: string; workspaceId: string }
  ): Promise<{ runtimeBotId: string; targetBotId?: string; tunnelId: string }> {
    const local = isAgent ? agentLink.readAgentLocalInfo(dir) : undefined
    const agentTarget = local ? agentLink.resolveAgentDevTargetForStack(local, selected) : undefined
    const legacyRuntimeHint = local && !agentTarget ? agentLink.getLegacyAgentDevRuntimeHint(local) : undefined
    const runtimeBotId = isAgent
      ? (agentTarget?.runtimeBotId ?? legacyRuntimeHint)
      : await this.projectCache.peek('devId')
    if (!runtimeBotId) {
      throw new errors.BotpressCLIError(
        isAgent
          ? local?.devId
            ? 'cached agent dev target scope does not match the selected stack — run `brt dev` for this stack before `brt dev --check`'
            : 'no cached agent dev bot id in agent.local.json — run `brt dev` once before `brt dev --check`'
          : 'no cached dev bot id in .botpress/project.cache.json — run `brt dev` once before `brt dev --check`'
      )
    }
    const targetBotId = isAgent ? agentTarget?.targetBotId : await this.projectCache.peek('devTargetBotId')
    if ((!isAgent || agentTarget) && (!targetBotId || !/^[1-9][0-9]*$/.test(targetBotId))) {
      throw new errors.BotpressCLIError(
        isAgent
          ? 'no verified numeric devTargetBotId in agent.local.json — run `brt dev` to resolve the dev target'
          : 'no verified numeric devTargetBotId in .botpress/project.cache.json — run `brt dev` to resolve the dev target'
      )
    }
    const tunnelId = isAgent ? runtimeBotId : ((await this.projectCache.peek('tunnelId')) ?? runtimeBotId)
    return { runtimeBotId, targetBotId, tunnelId }
  }

  private _devTunnelHttpUrl(tunnelId: string): string {
    const urlParseResult = utils.url.parse(this.argv.tunnelUrl)
    if (urlParseResult.status === 'error') {
      throw new errors.BotpressCLIError(`Invalid tunnel URL: ${urlParseResult.error}`)
    }
    const { url: parsedTunnelUrl } = urlParseResult
    const isSecured = parsedTunnelUrl.protocol === 'https' || parsedTunnelUrl.protocol === 'wss'
    return utils.url.format({
      ...parsedTunnelUrl,
      protocol: isSecured ? 'https' : 'http',
      path: `/${tunnelId}`,
    })
  }

  private async _readDevCheckRequestedIntegrations(): Promise<Record<string, RequestedReadinessIntegration>> {
    const { projectType, resolveProjectDefinition } = this.readProjectDefinitionFromFS()
    if (projectType !== 'bot') {
      throw new errors.BotpressCLIError(
        'brt dev --check currently reports dev bot readiness only for bot/agent projects'
      )
    }
    const projectDef = await resolveProjectDefinition()
    return this._devCheckRequestedIntegrations(projectDef.definition)
  }

  private _devCheckRequestedIntegrations(botDef: sdk.BotDefinition): Record<string, RequestedReadinessIntegration> {
    const out: Record<string, RequestedReadinessIntegration> = {}
    for (const [key, raw] of Object.entries(botDef.integrations ?? {})) {
      const integration = raw as {
        id?: string
        name?: string
        version?: string
        alias?: string
        definition?: { name?: string; version?: string }
      }
      const alias = integration.alias ?? key
      out[alias] = {
        ...(integration.id ? { id: integration.id } : {}),
        name: integration.name ?? integration.definition?.name ?? key,
        ...((integration.version ?? integration.definition?.version)
          ? { version: integration.version ?? integration.definition?.version }
          : {}),
      }
    }
    return out
  }

  private _failedReadinessIntegrations(
    integrations: Record<string, DevBotReadinessIntegration>,
    requested: Record<string, RequestedReadinessIntegration>
  ): Array<{
    alias: string
    integration: DevBotReadinessIntegration
    reason: string
  }> {
    const readyStatus = new Set(['registered'])
    const badStatus = new Set(['failed', 'missing', 'registration_failed', 'not_installed', 'unconfigured', 'errored'])
    return Object.entries(integrations).flatMap(([alias, integration]) => {
      const expected = requested[alias]
      if (!expected) {
        return [
          {
            alias,
            integration,
            reason: `unexpected authoritative integration ${alias}`,
          },
        ]
      }
      for (const field of ['id', 'name', 'version'] as const) {
        if (expected[field] !== undefined && integration[field] !== expected[field]) {
          return [
            {
              alias,
              integration,
              reason: `authoritative integration ${alias} ${field} is ${String(integration[field])}; expected ${expected[field]}`,
            },
          ]
        }
      }
      const status = integration.status?.trim().toLowerCase()
      if (integration.enabled === false) {
        return [{ alias, integration, reason: 'integration disabled' }]
      }
      if (!status) {
        return [{ alias, integration, reason: 'missing readiness status' }]
      }
      if (readyStatus.has(status)) {
        return []
      }
      if (badStatus.has(status)) {
        return [{ alias, integration, reason: `readiness status ${status}` }]
      }
      return [
        {
          alias,
          integration,
          reason: `unknown readiness status ${integration.status}`,
        },
      ]
    })
  }

  private _deploy = async (api: apiUtils.ApiClient, tunnelUrl: string) => {
    const { projectType, resolveProjectDefinition } = this.readProjectDefinitionFromFS()

    if (projectType === 'interface') {
      throw new errors.BotpressCLIError('This feature is not available for interfaces.')
    }
    if (projectType === 'integration' && this._initialDef?.type === 'integration') {
      const projectDef = await resolveProjectDefinition()
      this._checkSecrets(projectDef.definition)
      if (projectDef.definition.name !== this._initialDef.definition.name) {
        throw new errors.BotpressCLIError(
          `Integration name changed from "${this._initialDef.definition.name}" to "${projectDef.definition.name}". Renaming integrations during brt dev is not supported. Please restart brt dev.`
        )
      }
      const integrationDef = new sdk.IntegrationDefinition({
        ...projectDef.definition,
        name: this._deployedIntegrationName ?? this._initialDef.definition.name,
      })
      return await this._deployDevIntegration(api, tunnelUrl, integrationDef)
    }
    if (projectType === 'bot') {
      const projectDef = await resolveProjectDefinition()
      this._checkSecrets(projectDef.definition)
      return await this._deployDevBot(api, tunnelUrl, projectDef.definition)
    }
    throw new errors.UnsupportedProjectType()
  }

  private async _writeKnownSecretsToCache(secretEnvVariables: Record<string, string | null>) {
    const knownSecrets: Record<string, string | null> = {}
    for (const [prefixedSecretName, secretValue] of Object.entries(secretEnvVariables)) {
      const secretName = stripSecretEnvVariablePrefix(prefixedSecretName)
      knownSecrets[secretName] = secretValue
    }

    const nonNullKnownSecrets = utils.records.filterValues(knownSecrets, utils.guards.is.notNull)
    if (Object.keys(nonNullKnownSecrets).length === 0) {
      await this.projectCache.rm('secrets')
      return
    }
    await this.projectCache.set('secrets', nonNullKnownSecrets)
  }

  private async _readKnownSecretsFromCache() {
    return (await this.projectCache.get('secrets')) ?? {}
  }

  private _applyPrefixToSecrets(secrets: Record<string, string>): Record<string, string> {
    const prefixedSecretEntries = Object.entries(secrets).map(([secretName, secretValue]) => [
      secretEnvVariableName(secretName),
      secretValue,
    ])
    return Object.fromEntries(prefixedSecretEntries)
  }

  private _checkSecrets(projectDef: sdk.IntegrationDefinition | sdk.BotDefinition) {
    if (this._initialDef?.type !== 'integration' && this._initialDef?.type !== 'bot') {
      return
    }
    const initialSecrets = this._initialDef?.definition.secrets ?? {}
    const currentSecrets = projectDef.secrets ?? {}
    const newSecrets = Object.keys(currentSecrets).filter((s) => !initialSecrets[s])
    if (newSecrets.length > 0) {
      throw new errors.BotpressCLIError('Secrets were added while the server was running. A restart is required.')
    }
  }

  private _spawnWorker = async (env: Record<string, string>, port: number) => {
    const outfile = this.projectPaths.abs.outFileCJS
    const importPath = utils.path.toUnix(outfile)
    const code = `require('${importPath}').default.start(${port})`
    const worker = await Worker.spawn(
      {
        type: 'code',
        code,
        env,
      },
      this.logger
    ).catch((thrown) => {
      throw errors.BotpressCLIError.wrap(thrown, `Could not start dev worker on port ${port}`)
    })

    return worker
  }

  private async _spawnWorkerForResolvedDevTarget(
    api: apiUtils.ApiClient,
    httpTunnelUrl: string,
    inherited: Record<string, string>,
    port: number,
    spanIngestUrl?: string
  ): Promise<Worker> {
    let env = inherited
    if (this._initialDef?.type === 'bot') {
      // Resolve/provision the complete dev identity before the child can see
      // any runtime credentials. The cloud trace exporter consequently gets
      // the opaque runtime bot in x-bot-id while storage/admin clients get the
      // distinct numeric target id from BP_/ADK_TARGET_BOT_ID.
      const { target } = await this._ensureDevBotTarget(api, httpTunnelUrl)
      env = buildDevWorkerEnvironment({
        inherited,
        apiUrl: api.url,
        token: api.token,
        workspaceId: api.workspaceId,
        target,
        spanIngestUrl,
      })
    }
    return this._spawnWorker(env, port)
  }

  private _runBuild(watchEnabled = true) {
    return new BuildCommand(this.api, this.prompt, this.logger, this.argv)
      .setProjectContext(this.projectContext)
      .run(watchEnabled ? this._buildContext : undefined)
  }

  private async _disposeBuildResources({ stopEsbuild = false } = {}) {
    // Best-effort teardown: this runs from the `finally` of `run()`, so it must never throw —
    // a failure here would mask the original error being propagated by the dev server.
    try {
      await Promise.all([this._buildContext.dispose(), this.projectContext.dispose()])
      if (stopEsbuild) {
        await utils.esbuild.stop()
      }
    } catch (thrown: unknown) {
      const err = errors.BotpressCLIError.map(thrown)
      this.logger.debug(`Failed to dispose build resources: ${err.message}`)
    }
  }

  private async _deployDevIntegration(
    api: apiUtils.ApiClient,
    externalUrl: string,
    integrationDef: sdk.IntegrationDefinition
  ): Promise<void> {
    const devId = await this.projectCache.get('devId')

    let integration: client.Integration | undefined = undefined

    if (devId) {
      const resp = await api.client.getIntegration({ id: devId }).catch(async (thrown) => {
        const err = errors.BotpressCLIError.wrap(thrown, `Could not find existing dev integration with id "${devId}"`)
        this.logger.warn(err.message)
        this.logger.debug(errors.BotpressCLIError.fullStack(err))
        return { integration: undefined }
      })

      if (resp.integration?.dev) {
        integration = resp.integration
      } else {
        await this.projectCache.rm('devId')
      }
    }

    const line = this.logger.line()
    line.started(`Deploying dev integration ${chalk.bold(integrationDef.name)}...`)

    const createIntegrationBody = {
      ...(await this.prepareCreateIntegrationBody(integrationDef)),
      ...(await this.prepareIntegrationDependencies(integrationDef, api)),
      url: externalUrl,
    }

    if (integration) {
      const updateIntegrationBody = apiUtils.prepareUpdateIntegrationBody(
        { ...createIntegrationBody, id: integration.id },
        integration
      )

      const resp = await api.client.updateIntegration(updateIntegrationBody).catch((thrown) => {
        throw errors.BotpressCLIError.wrap(thrown, `Could not update dev integration "${integrationDef.name}"`)
      })
      integration = resp.integration
    } else {
      const resp = await api.client.createIntegration({ ...createIntegrationBody, dev: true }).catch((thrown) => {
        throw errors.BotpressCLIError.wrap(thrown, `Could not deploy dev integration "${integrationDef.name}"`)
      })
      integration = resp.integration
    }

    line.success(`Dev Integration deployed with id "${integration.id}" at "${externalUrl}"`)
    line.commit()

    await this.projectCache.set('devId', integration.id)
  }

  private async _deployDevBot(api: apiUtils.ApiClient, externalUrl: string, botDef: sdk.BotDefinition): Promise<void> {
    const { bot, target } = await this._ensureDevBotTarget(api, externalUrl)

    const updateBotBody = apiUtils.prepareUpdateBotBody(
      {
        ...(await apiUtils.prepareCreateBotBody(botDef)),
        ...(await this.prepareBotDependencies(botDef, api)),
        id: bot.id,
        url: externalUrl,
      },
      bot
    )

    let deployedBot = bot
    if (!(await this._didDefinitionChange(updateBotBody))) {
      this.logger.log('Skipping deployment step. No changes found in bot.definition.ts')
    } else {
      const updateLine = this.logger.line()
      updateLine.started('Deploying dev bot...')

      const response = await api.client.updateBot(updateBotBody).catch((thrown) => {
        throw errors.BotpressCLIError.wrap(thrown, 'Could not deploy dev bot')
      })
      resolveDevBotTarget(response.bot, target.runtimeBotId, target.targetBotId)
      deployedBot = response.bot

      this.validateIntegrationRegistration(deployedBot, (failedIntegrations) => {
        throw new errors.BotpressCLIError(
          `Some integrations failed to register:\n${Object.entries(failedIntegrations)
            .map(([key, int]) => `• ${key}: ${int.statusReason}`)
            .join('\n')}`
        )
      })

      updateLine.success(`Dev Bot deployed with id "${deployedBot.id}" at "${externalUrl}"`)
      updateLine.commit()
      await this._afterInitialDevBotDeploy?.()
    }

    const tablesPublisher = new tables.TablesPublisher({
      api,
      logger: this.logger,
      prompt: this.prompt,
    })
    await tablesPublisher.deployTables({
      botId: target.targetBotId,
      botDefinition: botDef,
    })

    await this.displayIntegrationUrls({ api, bot: deployedBot })
  }

  private async _ensureDevBotTarget(
    api: apiUtils.ApiClient,
    externalUrl: string
  ): Promise<{ bot: client.Bot; target: DevBotTarget }> {
    const expectedRuntimeBotId = this._runtimeBotIdFromDevUrl(externalUrl)
    const productionTags = developmentProductionTags(
      api.url,
      this._productionBotId ?? cloudLink.loadLinkIfPresent(this.projectPaths.abs.workDir, 'prod')?.botId
    )
    let devId = await this.projectCache.get('devId')
    let cachedTarget = await this.projectCache.get('devTargetBotId')
    if (devId && devId !== expectedRuntimeBotId) {
      await this.projectCache.rm('devId')
      await this.projectCache.rm('devTargetBotId')
      devId = undefined
      cachedTarget = undefined
    }

    let bot: client.Bot | undefined
    let target: DevBotTarget | undefined
    if (devId) {
      try {
        bot = (await api.client.getBot({ id: devId })).bot
        target = resolveDevBotTarget(bot, expectedRuntimeBotId, cachedTarget)
      } catch (thrown) {
        if (!this._isNotFoundError(thrown)) {
          throw errors.BotpressCLIError.wrap(thrown, `Could not resolve existing dev bot "${devId}"`)
        }
        bot = undefined
        target = undefined
      }
    }

    if (bot && target && productionTags) {
      // Reuse the idempotent create path to validate the cached Development
      // against its immutable Production project.
      const response = await api.client
        .createBot({
          dev: true,
          url: externalUrl,
          tags: productionTags,
        })
        .catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, 'Could not link dev bot to production')
        })
      bot = response.bot
      target = resolveDevBotTarget(bot, expectedRuntimeBotId, target.targetBotId)
    }

    if (!bot || !target) {
      const createLine = this.logger.line()
      createLine.started('Creating dev bot...')
      const resp = await api.client
        .createBot({
          dev: true,
          url: externalUrl,
          ...(productionTags ? { tags: productionTags } : {}),
        })
        .catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, 'Could not deploy dev bot')
        })

      bot = resp.bot
      target = resolveDevBotTarget(bot, expectedRuntimeBotId)
      createLine.log('Dev Bot created')
      createLine.commit()
    }
    await this.projectCache.set('devId', target.runtimeBotId)
    await this.projectCache.set('devTargetBotId', target.targetBotId)
    return { bot, target }
  }

  private _runtimeBotIdFromDevUrl(externalUrl: string): string {
    try {
      const segments = new URL(externalUrl).pathname.split('/').filter(Boolean)
      const runtimeBotId = segments.at(-1)
      if (runtimeBotId) return runtimeBotId
    } catch {
      // Fall through to one actionable error below.
    }
    throw new errors.BotpressCLIError(`Dev bot URL "${externalUrl}" has no opaque tunnel id.`)
  }

  private async _didDefinitionChange(body: apiUtils.UpdateBotRequestBody | apiUtils.UpdateIntegrationRequestBody) {
    const didChange = !isEqual(body, this._cacheDevRequestBody)
    this._cacheDevRequestBody = { ...body }
    return didChange
  }

  private _forwardTunnelRequest = async (baseUrl: string, request: TunnelRequest): Promise<TunnelResponse> => {
    const axiosConfig = {
      method: request.method,
      url: this._formatLocalUrl(baseUrl, request),
      headers: request.headers,
      data: request.body,
      responseType: 'text',
      validateStatus: () => true,
    } satisfies AxiosRequestConfig

    this.logger.debug(`Forwarding request to ${axiosConfig.url}`)
    const response = await axios(axiosConfig)
    this.logger.debug(
      `Tunnel response ${request.method} ${request.path} -> HTTP ${response.status} (requestId=${request.id})`
    )
    if (response.status >= 400) {
      this.logger.warn(formatTunnelFailure(request, response.status, response.data))
    }
    this.logger.debug('Sending back response up the tunnel')

    return {
      requestId: request.id,
      status: response.status,
      headers: this._getHeaders(response.headers),
      body: response.data,
    }
  }

  private _formatLocalUrl = (baseUrl: string, req: TunnelRequest): string => {
    if (req.query) {
      return `${baseUrl}${req.path}?${req.query}`
    }
    return `${baseUrl}${req.path}`
  }

  private _getHeaders = (res: AxiosResponse['headers']): TunnelResponse['headers'] => {
    const headers: TunnelResponse['headers'] = {}
    for (const key in res) {
      if (typeof res[key] === 'string' || typeof res[key] === 'number') {
        headers[key] = String(res[key])
      }
    }
    return headers
  }
}
