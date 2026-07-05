import type * as client from '@holocronlab/botruntime-client'
import * as sdk from '@holocronlab/botruntime-sdk'
import { TunnelRequest, TunnelResponse } from '@holocronlab/botruntime-tunnel'
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import chalk from 'chalk'
import { isEqual } from 'lodash'
import * as pathlib from 'path'
import * as uuid from 'uuid'
import * as fs from 'fs'
import * as apiUtils from '../api'
import * as adkBundle from '../adk-bundle'
import { secretEnvVariableName, stripSecretEnvVariablePrefix } from '../code-generation/secret-module'
import type commandDefinitions from '../command-definitions'
import { cloudInfo } from '../cloud-io'
import * as errors from '../errors'
import * as tables from '../tables'
import type { CommandArgv } from '../typings'
import * as utils from '../utils'
import { Worker } from '../worker'
import { AddCommand, type AddCommandDefinition } from './add-command'
import { BuildCommand } from './build-command'
import { DeployCommand, type DeployCommandDefinition } from './deploy-command'
import { ProjectCommand, ProjectDefinition } from './project-command'

const DEFAULT_BOT_PORT = 8075
const DEFAULT_INTEGRATION_PORT = 8076
const TUNNEL_HELLO_INTERVAL = 5000
const FILEWATCHER_DEBOUNCE_MS = 500

export type DevCommandDefinition = typeof commandDefinitions.dev
export class DevCommand extends ProjectCommand<DevCommandDefinition> {
  private _initialDef: ProjectDefinition | undefined = undefined
  private _deployedIntegrationName: string | undefined = undefined
  private _cacheDevRequestBody: apiUtils.UpdateBotRequestBody | apiUtils.UpdateIntegrationRequestBody | undefined
  private _buildContext: utils.esbuild.BuildCodeContext

  public constructor(...args: ConstructorParameters<typeof ProjectCommand<DevCommandDefinition>>) {
    super(...args)
    this._buildContext = new utils.esbuild.BuildCodeContext()
  }

  public async run(): Promise<void> {
    this.logger.warn('This command is experimental and subject to breaking changes without notice.')

    // An agent.config.ts project (no root *.definition.ts) branches to one of
    // TWO agent dev surfaces BEFORE readProjectDefinitionFromFS below (which
    // throws on an agent project — see project-command.ts _readProjectType):
    //
    //   - `brt dev` (default, auto-detected): _runAgentTunnelDev() — generates
    //     the synthetic classic bot at .adk/bot (the same in-process generator
    //     `brt deploy --adk` uses) and runs the CLASSIC tunnel/worker dev
    //     server below against it, in-process, via a nested DevCommand. This is
    //     "local-like-Botpress" dev: cloudapi's dev-bot/tunnel surface
    //     (createBot({dev:true,url}) under the workspace-PAT; the server
    //     derives the bot id from the tunnel URL and sets type:adk itself).
    //   - `brt dev --adk` (explicit): _runAdkDev() — the bespoke-cloudapi-wire
    //     deploy-loop (watch -> force rebuild -> `brt deploy --adk` -> the
    //     runtime-host supervisor hot-swaps on its next poll). Kept as the
    //     explicit opt-in cloud deploy-loop workflow; see _runAdkDev below.
    //
    // --adk always wins when both would apply. Neither branch touches the
    // Botpress-shaped ensureLoginAndCreateClient up here: _runAdkDev never
    // needs it (bespoke cloudapi profile/link instead), and
    // _runAgentTunnelDev's nested classic DevCommand calls it for itself.
    if (this.argv.adk) {
      return this._runAdkDev()
    }
    if (adkBundle.isAgentProject(this.projectPaths.abs.workDir)) {
      return this._runAgentTunnelDev()
    }

    const watchEnabled = this.argv.watch !== false
    let api = await this.ensureLoginAndCreateClient(this.argv)

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

    let env: Record<string, string> = {
      ...process.env,
      BP_API_URL: api.url,
      BP_TOKEN: api.token,
    }

    const defaultPort = this._initialDef.type === 'integration' ? DEFAULT_INTEGRATION_PORT : DEFAULT_BOT_PORT
    if (this._initialDef.type === 'integration' || this._initialDef.type === 'bot') {
      const knownSecrets = await this._readKnownSecretsFromCache()
      let secretEnvVariables = await this.promptSecrets(this._initialDef.definition, this.argv, {
        knownSecrets: Object.keys(knownSecrets),
        formatEnv: true,
      })
      secretEnvVariables = { ...this._applyPrefixToSecrets(knownSecrets), ...secretEnvVariables }
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

    const wsTunnelUrl: string = utils.url.format({ ...parsedTunnelUrl, protocol: isSecured ? 'wss' : 'ws' })
    const httpTunnelUrl: string = utils.url.format({
      ...parsedTunnelUrl,
      protocol: isSecured ? 'https' : 'http',
      path: `/${tunnelId}`,
    })

    let worker: Worker | undefined = undefined

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
          tunnel.send({ requestId: req.id, status: 503, body: 'Worker not ready yet' })
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

    await supervisor.start()

    await this._runBuild(watchEnabled)
    worker = await this._spawnWorker(env, port)

    try {
      await this._deploy(api, httpTunnelUrl)
    } catch (thrown) {
      if (worker.running) {
        await worker.kill()
      }
      throw errors.BotpressCLIError.wrap(thrown, 'An error occurred while deploying the dev server')
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
    }
  }

  // ---------------------------------------------------------------------
  // brt dev --adk — the EXPLICIT agent cloud deploy-loop. This is the OTHER
  // agent dev surface (see _runAgentTunnelDev below for the default one, which
  // runs the classic tunnel/worker dev server against a generated bot). This
  // path never spawns a local dev worker for the agent itself: hot-reload is
  // version-driven instead — `brt deploy --adk` PUTs the bundle (bumping the
  // bot's versionId), and the runtime-host supervisor polls
  // /internal/host/bots (~15s) and hot-swaps the running child when it sees a
  // new versionId. So the entire loop is: watch source -> force a fresh build
  // -> `brt deploy --adk` -> let the supervisor pick it up.
  // ---------------------------------------------------------------------
  private async _runAdkDev(): Promise<void> {
    const dir = this.projectPaths.abs.workDir
    const watchEnabled = this.argv.watch !== false

    let deploying = false
    let dirty = false

    // Builds a `brt deploy --adk` argv from this dev command's own argv. Only
    // literal keys that exist on deploySchema may be listed here (TS excess-
    // property-checks fresh object literals): deploySchema has several
    // required-with-default fields (visibility/public/allowDeprecated/noBuild/
    // dryRun/local/bypassBreakingChangeDetection) that devSchema does not
    // declare, so they are filled in explicitly with deploy's own defaults.
    // workDir/apiUrl/workspaceId/token/secrets/sourceMap/minify are shared by
    // both schemas and simply flow through the `...this.argv` spread.
    const deployArgv = (): CommandArgv<DeployCommandDefinition> => ({
      ...this.argv,
      adk: true,
      // Honor --local so `brt dev --adk --local` deploys against the
      // bot.local.json link (local runtime-host + cloudapi stack) exactly like
      // `brt deploy --adk --local`; devSchema now declares `local` too, so it
      // flows through the spread — restated here only for the excess-property
      // check's benefit (deploySchema/devSchema are distinct literal types).
      local: this.argv.local,
      noBuild: false,
      dryRun: false,
      visibility: 'private',
      public: false,
      allowDeprecated: false,
      bypassBreakingChangeDetection: false,
    })

    // Force a real rebuild on every iteration of the loop: drop the cached
    // bundle BEFORE handing off to DeployCommand, so its own
    // `adkBundle.ensureBundle(dir, /*force*/ false, buildFn)` (see
    // deploy-command.ts _deployAdkBundle) never short-circuits on a stale
    // .brt/dist/index.cjs left over from a previous pass through this loop. A
    // source change must always produce a freshly rebuilt bundle, never a
    // reused stale one.
    const forceDropCachedBundle = (): void => {
      const bundlePath = pathlib.join(dir, adkBundle.ADK_BUNDLE_REL_PATH)
      if (fs.existsSync(bundlePath)) fs.rmSync(bundlePath)
    }

    const deployOnce = async (): Promise<void> => {
      forceDropCachedBundle()
      await new DeployCommand(this.api, this.prompt, this.logger, deployArgv())
        .setProjectContext(this.projectContext)
        .run()
    }

    // Overlap guard: a file-change firing while a deploy is already in flight
    // does not launch a second, concurrent deploy (which could race the bundle
    // file / the provision-once path) — it only marks `dirty`, and the
    // in-flight deploy's own loop below picks up exactly one more pass once it
    // finishes, never launching more than one queued deploy at a time.
    const redeploy = async (): Promise<void> => {
      if (deploying) {
        dirty = true
        return
      }
      deploying = true
      try {
        do {
          dirty = false
          await deployOnce()
        } while (dirty)
      } finally {
        deploying = false
      }
    }

    cloudInfo(`adk dev: building + deploying ${dir} ...`)
    // Initial deploy fails loudly (never a silent no-op): a broken agent
    // project should stop `brt dev --adk` outright instead of starting a watch
    // loop over a bot that never successfully deployed.
    await redeploy().catch((thrown) => {
      throw errors.BotpressCLIError.wrap(thrown, 'adk dev: initial build/deploy failed')
    })
    cloudInfo(
      'adk dev: live. The runtime-host supervisor polls /internal/host/bots (~15s) and hot-swaps the running child shortly after each deploy above.'
    )

    if (!watchEnabled) {
      return
    }

    const watcher = await utils.filewatcher.FileWatcher.watch(
      dir,
      async (events) => {
        if (!events.some((e) => this._isAgentSourceChange(dir, e.path))) return
        this.logger.log('Changes detected, rebuilding + redeploying')
        try {
          await redeploy()
        } catch (thrown) {
          // Loud, never silent: a transient build/deploy error (e.g. a syntax
          // error mid-edit) must not kill the dev session, but it must be
          // impossible to miss either.
          const err = errors.BotpressCLIError.wrap(thrown, 'adk dev: redeploy failed')
          this.logger.error(err.message)
          this.logger.debug(errors.BotpressCLIError.fullStack(err))
        }
      },
      { debounceMs: FILEWATCHER_DEBOUNCE_MS }
    )

    try {
      await watcher.wait()
    } finally {
      await watcher.close()
    }
  }

  // Filters file-change events down to agent SOURCE changes: .ts files and
  // agent.config.ts under `dir`, excluding anything under the generated/build
  // dirs (.adk/, .brt/) or node_modules — those changes are OUTPUT of a
  // generate/deploy step, not input to one, and would otherwise retrigger the
  // watch loop forever. Shared by _runAdkDev (the deploy-loop's watch) and
  // _runAgentTunnelDev (the tunnel dev's outer regen-watch) below.
  private _isAgentSourceChange(dir: string, changedPath: string): boolean {
    const rel = pathlib.relative(dir, changedPath)
    if (rel.startsWith('..')) return false
    const segments = rel.split(pathlib.sep)
    if (segments[0] === '.adk' || segments[0] === '.brt' || segments[0] === 'node_modules') return false
    return pathlib.extname(changedPath) === '.ts' || pathlib.basename(changedPath) === adkBundle.AGENT_CONFIG_FILE
  }

  // In-process dependency installer for the agent bot generator: drives brt's
  // OWN native AddCommand as a plain function call instead of spawning a
  // provisioned brt binary to `bp add` each integration/plugin/interface into
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
    const installer = this._buildAdkDependencyInstaller()

    cloudInfo(`agent dev: generating tunnel bot for ${dir} ...`)
    // Initial generation fails loudly (never a silent no-op): a broken agent
    // project should stop `brt dev` outright instead of starting a tunnel dev
    // session against a bot that was never successfully generated.
    const botPath = await adkBundle.generateAgentBot(dir, installer).catch((thrown) => {
      throw errors.BotpressCLIError.wrap(thrown, 'agent dev: initial bot generation failed')
    })

    let regenerating = false
    let regenDirty = false
    // Overlap guard, same shape as _runAdkDev's redeploy(): a file-change
    // firing while a regen is already in flight does not launch a second,
    // concurrent regen — it only marks `regenDirty`, and the in-flight
    // regen's own loop below picks up exactly one more pass once it finishes.
    const regenerate = async (): Promise<void> => {
      if (regenerating) {
        regenDirty = true
        return
      }
      regenerating = true
      try {
        do {
          regenDirty = false
          await adkBundle.generateAgentBot(dir, installer)
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
          if (!events.some((e) => this._isAgentSourceChange(dir, e.path))) return
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

    // devSchema/adk:false narrows nothing here (nestedArgv shares the exact
    // same schema as `this.argv`, only workDir/adk are overridden), so the
    // nested DevCommand inherits every shared flag (--watch, --port,
    // --tunnelUrl, credentials, secrets, ...) unchanged. It resolves its own
    // fresh ProjectPaths/ProjectDefinitionContext/projectCache off workDir and
    // self-disposes them in its own run(); no explicit teardown is needed here
    // beyond closing the outer watcher.
    const nestedArgv: CommandArgv<DevCommandDefinition> = {
      ...this.argv,
      workDir: botPath,
      adk: false,
    }

    cloudInfo(`agent dev: starting classic tunnel dev on ${botPath} ...`)
    try {
      await new DevCommand(this.api, this.prompt, this.logger, nestedArgv).run()
    } finally {
      await watcher?.close()
    }
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
          `Integration name changed from "${this._initialDef.definition.name}" to "${projectDef.definition.name}". Renaming integrations during bp dev is not supported. Please restart bp dev.`
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
    const devId = await this.projectCache.get('devId')

    let bot: client.Bot | undefined = undefined

    if (devId) {
      const resp = await api.client.getBot({ id: devId }).catch(async (thrown) => {
        const err = errors.BotpressCLIError.wrap(thrown, `Could not find existing dev bot with id "${devId}"`)
        this.logger.warn(err.message)
        this.logger.debug(errors.BotpressCLIError.fullStack(err))
        return { bot: undefined }
      })

      if (resp.bot?.dev) {
        bot = resp.bot
      } else {
        await this.projectCache.rm('devId')
      }
    }

    if (!bot) {
      const createLine = this.logger.line()
      createLine.started('Creating dev bot...')
      const resp = await api.client
        .createBot({
          dev: true,
          url: externalUrl,
        })
        .catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, 'Could not deploy dev bot')
        })

      bot = resp.bot
      createLine.log('Dev Bot created')
      createLine.commit()
      await this.projectCache.set('devId', bot.id)
    }

    const updateBotBody = apiUtils.prepareUpdateBotBody(
      {
        ...(await apiUtils.prepareCreateBotBody(botDef)),
        ...(await this.prepareBotDependencies(botDef, api)),
        id: bot.id,
        url: externalUrl,
      },
      bot
    )

    if (!(await this._didDefinitionChange(updateBotBody))) {
      this.logger.log('Skipping deployment step. No changes found in bot.definition.ts')
      return
    }
    const updateLine = this.logger.line()
    updateLine.started('Deploying dev bot...')

    const { bot: updatedBot } = await api.client.updateBot(updateBotBody).catch((thrown) => {
      throw errors.BotpressCLIError.wrap(thrown, 'Could not deploy dev bot')
    })

    this.validateIntegrationRegistration(updatedBot, (failedIntegrations) => {
      throw new errors.BotpressCLIError(
        `Some integrations failed to register:\n${Object.entries(failedIntegrations)
          .map(([key, int]) => `• ${key}: ${int.statusReason}`)
          .join('\n')}`
      )
    })

    updateLine.success(`Dev Bot deployed with id "${updatedBot.id}" at "${externalUrl}"`)
    updateLine.commit()

    const tablesPublisher = new tables.TablesPublisher({ api, logger: this.logger, prompt: this.prompt })
    await tablesPublisher.deployTables({ botId: updatedBot.id, botDefinition: botDef })

    await this.displayIntegrationUrls({ api, bot: updatedBot })
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
