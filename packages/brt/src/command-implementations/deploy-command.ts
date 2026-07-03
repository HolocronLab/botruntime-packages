import * as client from '@holocronlab/botruntime-client'
import * as sdk from '@holocronlab/botruntime-sdk'
import chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import semver from 'semver'
import * as apiUtils from '../api'
import { CloudapiClient } from '../api/cloudapi-client'
import * as adkBundle from '../adk-bundle'
import * as botsStore from '../bots-store'
import { cloudInfo, cloudWarn } from '../cloud-io'
import * as cloudProfileResolve from '../cloud-profile-resolve'
import * as cloudLink from '../cloud-project-link'
import type commandDefinitions from '../command-definitions'
import type { CommandArgv } from '../typings'
import * as declaredCommands from '../declared-commands'
import * as declaredTables from '../declared-tables'
import * as errors from '../errors'
import * as tables from '../tables'
import * as utils from '../utils'
import { BuildCommand } from './build-command'
import { ProjectCommand, ProjectDefinitionContext } from './project-command'

export type DeployCommandDefinition = typeof commandDefinitions.deploy
export class DeployCommand extends ProjectCommand<DeployCommandDefinition> {
  public async run(): Promise<void> {
    // --adk gates the bespoke-cloudapi-wire ADK-bundle deploy path (ported
    // from the (deleted) thin brt CLI's commands/deploy.ts). This is a
    // SEPARATE surface from the Botpress-shaped deploy below: it targets a
    // bot.json/bot.local.json-linked bot via CloudapiClient instead of
    // @holocronlab/botruntime-client, and never touches botDefinition.ts /
    // integration.definition.ts. The default (Botpress-shaped) deploy below
    // is unchanged and still runs whenever --adk is not passed.
    if (this.argv.adk) {
      return this._deployAdkBundle()
    }

    const api = await this.ensureLoginAndCreateClient(this.argv)

    if (!this.argv.noBuild) {
      await this._runBuild() // This ensures the bundle is always synced with source code
    }

    const { projectType, resolveProjectDefinition } = this.readProjectDefinitionFromFS()

    if (projectType === 'integration') {
      const projectDef = await resolveProjectDefinition()
      return this._deployIntegration(api, projectDef.definition)
    }
    if (projectType === 'interface') {
      const projectDef = await resolveProjectDefinition()
      return this._deployInterface(api, projectDef.definition)
    }
    if (projectType === 'plugin') {
      const projectDef = await resolveProjectDefinition()
      return this._deployPlugin(api, projectDef.definition)
    }
    if (projectType === 'bot') {
      const projectDef = await resolveProjectDefinition()
      return this._deployBot(api, projectDef.definition, this.argv.botId, this.argv.createNewBot)
    }
    throw new errors.UnsupportedProjectType()
  }

  private async _runBuild() {
    return new BuildCommand(this.api, this.prompt, this.logger, this.argv).setProjectContext(this.projectContext).run()
  }

  private get _visibility(): 'public' | 'private' | 'unlisted' {
    if (this.argv.public && this.argv.visibility === 'private') {
      this.logger.warn('The --public flag is deprecated. Please use "--visibility public" instead.')
      return 'public'
    }

    if (this.argv.public && this.argv.visibility !== 'private') {
      this.logger.warn('The --public flag and --visibility option are both present. Ignoring the --public flag...')
    }

    return this.argv.visibility
  }

  private async _deployIntegration(api: apiUtils.ApiClient, integrationDef: sdk.IntegrationDefinition) {
    const res = await this.manageWorkspaceHandle(api, { type: 'integration', definition: integrationDef })
    if (!res) return
    const { definition: updatedIntegrationDef, workspaceId } = res
    integrationDef = updatedIntegrationDef
    if (workspaceId) {
      api = api.switchWorkspace(workspaceId)
    }
    if (this.argv.bypassBreakingChangeDetection) {
      api = api.withExtraHeaders({ 'x-bypass-breaking-changes-detection': 'true' })
    }

    const { name, version } = integrationDef

    if (integrationDef.icon && !integrationDef.icon.toLowerCase().endsWith('.svg')) {
      throw new errors.BotpressCLIError('Icon must be an SVG file')
    }

    if (integrationDef.readme && !integrationDef.readme.toLowerCase().endsWith('.md')) {
      throw new errors.BotpressCLIError('Readme must be a Markdown file')
    }

    const integration = await api.findPublicOrPrivateIntegration({ type: 'name', name, version })
    if (integration && integration.workspaceId !== api.workspaceId) {
      throw new errors.BotpressCLIError(
        `Public integration ${name} v${version} is already deployed in another workspace.`
      )
    }

    if (integration && integration.visibility !== 'private' && !api.isBotpressWorkspace) {
      this.logger.warn(
        `Integration ${name} v${version} is already deployed publicly and cannot be updated. You should publish a new version instead.`
      )
    }

    let message: string
    if (integration) {
      this.logger.warn('Integration already exists. If you decide to deploy, it will override the existing one.')
      message = `Are you sure you want to override integration ${name} v${version}?`
    } else {
      message = `Are you sure you want to deploy integration ${name} v${version}?`
    }

    const confirm = await this.prompt.confirm(message)
    if (!confirm) {
      this.logger.log('Aborted')
      return
    }

    this.logger.debug('Preparing integration request body...')

    const createBody = {
      ...(await this.prepareCreateIntegrationBody(integrationDef)),
      ...(await this.prepareIntegrationDependencies(integrationDef, api)),
      visibility: this._visibility,
      sdkVersion: integrationDef.metadata?.sdkVersion,
      url: this.argv.url,
    }

    const startedMessage = `Deploying integration ${chalk.bold(name)} v${version}...`
    const successMessage = 'Integration deployed'
    if (integration) {
      const updateBody = apiUtils.prepareUpdateIntegrationBody(
        {
          id: integration.id,
          ...createBody,
        },
        integration
      )

      const { secrets: knownSecrets } = integration
      updateBody.secrets = await this.promptSecrets(integrationDef, this.argv, { knownSecrets })
      this._detectDeprecatedFeatures(integrationDef, { allowDeprecated: true })

      const line = this.logger.line()
      line.started(startedMessage)

      if (this.argv.dryRun) {
        this.logger.log('Dry-run mode is active. Simulating integration update...')

        await api.client.validateIntegrationUpdate(updateBody).catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, `Could not update integration "${name}"`)
        })
      } else {
        await api.client.updateIntegration(updateBody).catch((thrown) => {
          const error = errors.BotpressCLIError.wrap(thrown, `Could not update integration "${name}"`)
          if (
            api.isBotpressWorkspace &&
            !this.argv.bypassBreakingChangeDetection &&
            client.isApiError(thrown) &&
            thrown.type === 'BreakingChanges'
          ) {
            this.logger.warn('Tip: redeploy with --bypassBreakingChangeDetection to skip this check')
          }
          throw error
        })
      }

      line.success(successMessage)
    } else {
      this.logger.debug(`looking for previous version of integration "${name}"`)
      const previousVersion = await api.findPreviousIntegrationVersion({ type: 'name', name, version })

      if (previousVersion) {
        this.logger.debug(`previous version found: ${previousVersion.version}`)
      } else {
        this.logger.debug('no previous version found')
      }

      const knownSecrets = previousVersion?.secrets

      createBody.secrets = await this.promptSecrets(integrationDef, this.argv, { knownSecrets })
      this._detectDeprecatedFeatures(integrationDef, {
        allowDeprecated: this._allowDeprecatedFeatures(integrationDef, previousVersion),
      })

      const line = this.logger.line()
      line.started(startedMessage)

      if (this.argv.dryRun) {
        this.logger.log('Dry-run mode is active. Simulating integration creation...')

        await api.client.validateIntegrationCreation(createBody).catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, `Could not create integration "${name}"`)
        })
      } else {
        await api.client.createIntegration(createBody).catch((thrown) => {
          const error = errors.BotpressCLIError.wrap(thrown, `Could not create integration "${name}"`)
          if (
            api.isBotpressWorkspace &&
            !this.argv.bypassBreakingChangeDetection &&
            client.isApiError(thrown) &&
            thrown.type === 'BreakingChanges'
          ) {
            this.logger.warn('Tip: redeploy with --bypassBreakingChangeDetection to skip this check')
          }
          throw error
        })
      }

      line.success(successMessage)
    }
  }

  private async _deployInterface(api: apiUtils.ApiClient, interfaceDeclaration: sdk.InterfaceDefinition) {
    if (this._visibility === 'unlisted') {
      throw new errors.BotpressCLIError(
        'Unlisted visibility is not supported for interfaces. Please use "public" or "private".'
      )
    }

    if (interfaceDeclaration.icon && !interfaceDeclaration.icon.toLowerCase().endsWith('.svg')) {
      throw new errors.BotpressCLIError('Icon must be an SVG file')
    }

    if (interfaceDeclaration.readme && !interfaceDeclaration.readme.toLowerCase().endsWith('.md')) {
      throw new errors.BotpressCLIError('Readme must be a Markdown file')
    }

    const { name, version } = interfaceDeclaration
    const intrface = await api.findPublicOrPrivateInterface({ type: 'name', name, version })

    let message: string
    if (intrface) {
      this.logger.warn('Interface already exists. If you decide to deploy, it will override the existing one.')
      message = `Are you sure you want to override interface ${name} v${version}?`
    } else {
      message = `Are you sure you want to deploy interface ${name} v${version}?`
    }

    const confirm = await this.prompt.confirm(message)
    if (!confirm) {
      this.logger.log('Aborted')
      return
    }

    const icon = await this.readProjectFile(interfaceDeclaration.icon, 'base64')
    const readme = await this.readProjectFile(interfaceDeclaration.readme, 'base64')

    if (this._visibility !== 'public') {
      this.logger.warn(
        'You are currently publishing a private interface, which cannot be used by integrations and plugins. To fix this, change the visibility to "public"'
      )
    }

    const createBody = {
      ...(await apiUtils.prepareCreateInterfaceBody(interfaceDeclaration)),
      public: this._visibility === 'public',
      icon,
      readme,
      sdkVersion: interfaceDeclaration.metadata?.sdkVersion,
    }

    const startedMessage = `Deploying interface ${chalk.bold(name)} v${version}...`
    const successMessage = 'Interface deployed'
    if (intrface) {
      const updateBody = apiUtils.prepareUpdateInterfaceBody(
        {
          id: intrface.id,
          ...createBody,
        },
        intrface
      )

      const line = this.logger.line()
      line.started(startedMessage)

      if (this.argv.dryRun) {
        this.logger.warn('Dry-run mode is not supported for interface updates. Skipping deployment...')
      } else {
        await api.client.updateInterface(updateBody).catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, `Could not update interface "${name}"`)
        })
      }

      line.success(successMessage)
    } else {
      const line = this.logger.line()
      line.started(startedMessage)

      if (this.argv.dryRun) {
        this.logger.warn('Dry-run mode is not supported for interface creation. Skipping deployment...')
      } else {
        await api.client.createInterface(createBody).catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, `Could not create interface "${name}"`)
        })
      }

      line.success(successMessage)
    }
  }

  private async _deployPlugin(api: apiUtils.ApiClient, pluginDef: sdk.PluginDefinition) {
    const res = await this.manageWorkspaceHandle(api, { type: 'plugin', definition: pluginDef })
    if (!res) return
    const { definition: updatedPluginDef, workspaceId } = res
    pluginDef = updatedPluginDef
    if (workspaceId) {
      api = api.switchWorkspace(workspaceId)
    }

    const codeCJS = await fs.promises.readFile(this.projectPaths.abs.outFileCJS, 'utf-8')
    const codeESM = await fs.promises.readFile(this.projectPaths.abs.outFileESM, 'utf-8')

    const { name, version } = pluginDef

    if (pluginDef.icon && !pluginDef.icon.toLowerCase().endsWith('.svg')) {
      throw new errors.BotpressCLIError('Icon must be an SVG file')
    }

    if (pluginDef.readme && !pluginDef.readme.toLowerCase().endsWith('.md')) {
      throw new errors.BotpressCLIError('Readme must be a Markdown file')
    }

    const plugin = await api.findPublicOrPrivatePlugin({ type: 'name', name, version })

    let message: string
    if (plugin) {
      this.logger.warn('Plugin already exists. If you decide to deploy, it will override the existing one.')
      message = `Are you sure you want to override plugin ${name} v${version}?`
    } else {
      message = `Are you sure you want to deploy plugin ${name} v${version}?`
    }

    const confirm = await this.prompt.confirm(message)
    if (!confirm) {
      this.logger.log('Aborted')
      return
    }

    this.logger.debug('Preparing plugin request body...')

    const icon = await this.readProjectFile(pluginDef.icon, 'base64')
    const readme = await this.readProjectFile(pluginDef.readme, 'base64')

    const createBody = {
      ...(await apiUtils.prepareCreatePluginBody(pluginDef)),
      ...(await this.preparePluginDependencies(pluginDef, api)),
      visibility: this._visibility,
      icon,
      readme,
      code: {
        node: codeCJS,
        browser: codeESM,
      },
      sdkVersion: pluginDef.metadata?.sdkVersion,
    }

    const startedMessage = `Deploying plugin ${chalk.bold(name)} v${version}...`
    const successMessage = 'Plugin deployed'
    if (plugin) {
      const updateBody = apiUtils.prepareUpdatePluginBody(
        {
          id: plugin.id,
          ...createBody,
        },
        plugin
      )

      const line = this.logger.line()
      line.started(startedMessage)

      if (this.argv.dryRun) {
        this.logger.warn('Dry-run mode is not supported for plugin updates. Skipping deployment...')
      } else {
        await api.client.updatePlugin(updateBody).catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, `Could not update plugin "${name}"`)
        })
      }

      line.success(successMessage)
    } else {
      const line = this.logger.line()
      line.started(startedMessage)

      if (this.argv.dryRun) {
        this.logger.warn('Dry-run mode is not supported for plugin creation. Skipping deployment...')
      } else {
        await api.client.createPlugin(createBody).catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, `Could not create plugin "${name}"`)
        })
      }

      line.success(successMessage)
    }
  }

  private _allowDeprecatedFeatures(
    integrationDef: sdk.IntegrationDefinition,
    previousVersion: client.Integration | undefined
  ): boolean {
    if (this.argv.allowDeprecated) {
      return true
    }

    if (!previousVersion) {
      return false
    }

    const versionDiff = semver.diff(integrationDef.version, previousVersion.version)
    if (!versionDiff) {
      return false
    }

    return utils.semver.releases.lt(versionDiff, 'major')
  }

  private _detectDeprecatedFeatures(
    integrationDef: sdk.IntegrationDefinition,
    opts: { allowDeprecated?: boolean } = {}
  ) {
    const deprecatedFields: string[] = []
    const { user, channels } = integrationDef
    if (user?.creation?.enabled) {
      deprecatedFields.push('user.creation')
    }

    for (const [channelName, channel] of Object.entries(channels ?? {})) {
      if (channel?.conversation?.creation?.enabled) {
        deprecatedFields.push(`channels.${channelName}.creation`)
      }
    }

    if (!deprecatedFields.length) {
      return
    }

    const errorMessage = `The following fields of the integration's definition are deprecated: ${deprecatedFields.join(
      ', '
    )}`

    if (opts.allowDeprecated) {
      this.logger.warn(errorMessage)
    } else {
      throw new errors.BotpressCLIError(errorMessage)
    }
  }

  private async _deployBot(
    api: apiUtils.ApiClient,
    botDefinition: sdk.BotDefinition,
    argvBotId: string | undefined,
    argvCreateNew: boolean | undefined
  ) {
    if (this.argv.dryRun) {
      this.logger.warn('Dry-run mode is not supported for bot deployments. Skipping deployment...')
      return
    }

    const outfile = this.projectPaths.abs.outFileCJS
    const code = await fs.promises.readFile(outfile, 'utf-8')

    let bot: client.Bot
    if (argvBotId && argvCreateNew) {
      throw new errors.BotpressCLIError('Cannot specify both --botId and --createNew')
    } else if (argvCreateNew) {
      const confirm = await this.prompt.confirm('Are you sure you want to create a new bot ?')
      if (!confirm) {
        this.logger.log('Aborted')
        return
      }

      bot = await this._createNewBot(api)
    } else {
      bot = await this._getExistingBot(api, argvBotId)

      const confirm = await this.prompt.confirm(`Are you sure you want to deploy the bot "${bot.name}"?`)
      if (!confirm) {
        this.logger.log('Aborted')
        return
      }
    }

    const line = this.logger.line()
    line.started(`Deploying bot ${chalk.bold(bot.name)}...`)

    const updateBotBody = apiUtils.prepareUpdateBotBody(
      {
        ...(await apiUtils.prepareCreateBotBody(botDefinition)),
        ...(await this.prepareBotDependencies(botDefinition, api)),
        id: bot.id,
        code,
      },
      bot
    )

    updateBotBody.secrets = await this.promptSecrets(botDefinition, this.argv, { knownSecrets: bot.secrets })

    const { bot: updatedBot } = await api.client.updateBot(updateBotBody).catch((thrown) => {
      throw errors.BotpressCLIError.wrap(thrown, `Could not update bot "${bot.name}"`)
    })

    this.validateIntegrationRegistration(updatedBot, (failedIntegrations) =>
      this.logger.warn(
        `Some integrations failed to register:\n${Object.entries(failedIntegrations)
          .map(([key, int]) => `• ${key}: ${int.statusReason}`)
          .join('\n')}`
      )
    )

    const tablesPublisher = new tables.TablesPublisher({ api, logger: this.logger, prompt: this.prompt })
    await tablesPublisher.deployTables({ botId: updatedBot.id, botDefinition })

    line.success('Bot deployed')
    await this.displayIntegrationUrls({ api, bot: updatedBot })
  }

  private async _createNewBot(api: apiUtils.ApiClient): Promise<client.Bot> {
    const line = this.logger.line()
    const { bot: createdBot } = await api.client.createBot({}).catch((thrown) => {
      throw errors.BotpressCLIError.wrap(thrown, 'Could not create bot')
    })
    line.success(`Bot created with ID "${createdBot.id}" and name "${createdBot.name}"`)
    await this.projectCache.set('botId', createdBot.id)
    return createdBot
  }

  private async _getExistingBot(api: apiUtils.ApiClient, botId: string | undefined): Promise<client.Bot> {
    const promptedBotId = await this.projectCache.sync('botId', botId, async (defaultId) => {
      const userBots = await api
        .listAllPages(api.client.listBots, (r) => r.bots)
        .catch((thrown) => {
          throw errors.BotpressCLIError.wrap(thrown, 'Could not fetch existing bots')
        })

      if (!userBots.length) {
        throw new errors.NoBotsFoundError()
      }

      const initial = userBots.find((bot) => bot.id === defaultId)

      const prompted = await this.prompt.select('Which bot do you want to deploy?', {
        initial: initial && { title: initial.name, value: initial.id },
        choices: userBots.map((bot) => ({ title: bot.name, value: bot.id })),
      })

      if (!prompted) {
        throw new errors.ParamRequiredError('Bot Id')
      }

      return prompted
    })

    const { bot: fetchedBot } = await api.client.getBot({ id: promptedBotId }).catch((thrown) => {
      throw errors.BotpressCLIError.wrap(thrown, 'Could not get bot info')
    })

    return fetchedBot
  }

  // ---------------------------------------------------------------------
  // brt deploy --adk — provision-if-needed -> build-if-needed -> PUT bundle
  // -> verify(sha256) -> sync tables. Contract-identical to the (deleted)
  // thin brt CLI's commands/deploy.ts against the SAME bespoke cloudapi wire
  // (see src/api/cloudapi-client.ts). Endpoints hit:
  //   POST /v1/admin/provision-bot     (only when no botId is linked/given)
  //   PUT  /v1/admin/bots/{id}         (the bundle, code inline)
  //   GET  /internal/bots/{id}/bundle  (round-trip verify; needs internalToken)
  // ---------------------------------------------------------------------
  // _buildAdkBundle is Ф1's in-process replacement for the old shell-out. It
  // (a) calls the @holocronlab/botruntime-adk library to generate the synthetic
  // classic bot at <dir>/.adk/bot, (b) builds that generated bot with brt's OWN
  // native BuildCommand (codegen + esbuild — the SAME pipeline as a Botpress-
  // shaped bot), and (c) normalizes the produced bundle to .brt/dist/index.cjs.
  // Nothing here spawns an external adk/bp binary.
  private async _buildAdkBundle(dir: string): Promise<string> {
    const botPath = await adkBundle.generateAgentBot(dir)

    // Point a fresh BuildCommand at the generated bot dir. A fresh
    // ProjectDefinitionContext (its own esbuild context) is used and disposed,
    // so it never entangles with this deploy command's own project context
    // (bound to the agent dir).
    const buildArgv: CommandArgv<DeployCommandDefinition> = { ...this.argv, workDir: botPath }
    const projectContext = new ProjectDefinitionContext()
    try {
      await new BuildCommand(this.api, this.prompt, this.logger, buildArgv)
        .setProjectContext(projectContext)
        .run()
    } finally {
      await projectContext.dispose()
    }

    return adkBundle.normalizeBundle(dir)
  }

  private async _deployAdkBundle(): Promise<void> {
    const dir = this.projectPaths.abs.workDir
    const linkEnv: cloudLink.LinkEnv = this.argv.local ? 'local' : 'prod'
    let link: cloudLink.BotLink = cloudLink.loadLinkIfPresent(dir, linkEnv) ?? {}

    const { name: profileName, profile } = await cloudProfileResolve.resolveProfile({
      argvProfile: this.argv.profile,
      getActiveProfile: () => this.globalCache.get('activeProfile'),
      readProfile: (n) => this.readProfileFromFS(n),
    })
    const apiUrl = cloudProfileResolve.resolveApiUrl(this.argv.apiUrl, profile, link)
    const botsStorePath = this.globalPaths.abs.botsStoreFile

    let botId: string
    let perBotKey: string
    if (this.argv.botId === undefined && link.botId === undefined) {
      // 1. provision once (no botId yet, and no --bot-id override). Persist
      // the key BEFORE the link, atomically, so a crash leaves a recoverable
      // bot rather than an orphan with a lost key.
      cloudInfo(`provision new bot on ${apiUrl} ...`)
      const machineClient = new CloudapiClient(apiUrl, profile.token)
      const prov = await machineClient.provisionBot(this.argv.name)
      botId = String(prov.botId)
      perBotKey = prov.apiKey
      if (!botId || !perBotKey) {
        throw new errors.BotpressCLIError(`provision returned no botId/apiKey: ${JSON.stringify(prov)}`)
      }

      const store = botsStore.readBotsStore(botsStorePath)
      botsStore.setBotCreds(store, profileName, botId, { apiKey: perBotKey })
      botsStore.writeBotsStore(botsStorePath, store)

      link = { ...link, botId: prov.botId, workspaceId: prov.workspaceId, apiUrl }
      cloudLink.saveLink(dir, linkEnv, link)
      cloudInfo(`provisioned botId=${botId} workspaceId=${prov.workspaceId}`)
    } else {
      botId = this.argv.botId ?? String(link.botId)
      const store = botsStore.readBotsStore(botsStorePath)
      const creds = botsStore.getBotCreds(store, profileName, botId)
      if (!creds?.apiKey) {
        throw new errors.BotpressCLIError(
          `bot ${botId} is linked but its per-bot key is missing from ${botsStorePath} (profile "${profileName}") — ` +
            `run \`brt link --bot-id ${botId} --key-stdin\`, or re-provision (drop ${cloudLink.linkFileName(linkEnv)} to orphan the old bot)`
        )
      }
      perBotKey = creds.apiKey
    }

    // 2. build if needed — in-process: generate the synthetic classic bot with
    // the @holocronlab/botruntime-adk library, then build it with brt's OWN
    // native pipeline. No child process to any adk/bp binary.
    const bundlePath = this.argv.noBuild
      ? adkBundle.requireExistingBundle(dir)
      : await adkBundle.ensureBundle(dir, false, () => this._buildAdkBundle(dir))
    const code = await fs.promises.readFile(bundlePath, 'utf-8')
    const localHash = adkBundle.sha256(code)
    cloudInfo(`bundle ${bundlePath} (${code.length} bytes, sha256 ${localHash.slice(0, 12)}…)`)

    const commands = declaredCommands.extractDeclaredCommands(dir)
    cloudInfo(
      commands.length === 0 ? 'commands: none declared' : `commands: ${commands.map((c) => '/' + c.command).join(', ')}`
    )

    // 3. PUT bundle under the per-bot key
    const bot = new CloudapiClient(apiUrl, perBotKey)
    cloudInfo(`deploy -> PUT ${apiUrl}/v1/admin/bots/${botId}`)
    await bot.putBundle(botId, this.argv.name ?? botId, code, commands)

    // 4. verify round-trip by sha256 (length alone would pass on a corrupt/raced copy)
    const internalToken = profile.internalToken
    if (internalToken) {
      const pulled = await bot.getBundle(botId, internalToken)
      const pulledHash = adkBundle.sha256(pulled.code ?? '')
      if (pulledHash !== localHash) {
        throw new errors.BotpressCLIError(`verify MISMATCH: deployed sha256 ${localHash} != pulled ${pulledHash}`)
      }
      cloudInfo(`verified round-trip (versionId=${pulled.versionId})`)
    } else {
      cloudWarn(
        'verify skipped: no internalToken in profile (/internal/* is gated by X-Internal-Token on prod). ' +
          'This is expected for external developers, not an error.'
      )
    }

    // 5. synchronize declared tables (mirrors the Botpress-shaped deploy's own
    // bundle-then-tables order above): without this step the bot's first
    // table write 404s and the web console shows no tables.
    await this._syncAdkTables(dir, bot, botId)

    this._writeAdkLastDeploy(dir, { botId, sha256: localHash, at: new Date().toISOString() })

    cloudInfo('deploy OK.')
    cloudInfo('next: brt integrations install <name@version> --config-stdin   then   brt integrations register <webhookId>')
  }

  // syncTables creates declared tables that do not yet exist on cloudapi.
  // Existing tables are left untouched (column migration is out of scope); a
  // create failure aborts loudly naming the offending table. Idempotent: a
  // re-run sees them all listed and creates nothing.
  private async _syncAdkTables(dir: string, bot: CloudapiClient, botId: string): Promise<void> {
    const declared = declaredTables.extractDeclaredTables(dir)
    if (declared.length === 0) {
      cloudInfo('tables: none declared')
      return
    }
    cloudInfo(`synchronizing ${declared.length} table(s)…`)
    const existing = new Set((await bot.listTables(botId)).tables.map((t) => t.name))
    let created = 0
    for (const table of declared) {
      if (existing.has(table.name)) {
        cloudInfo(`  ${table.name}: up to date`)
        continue
      }
      try {
        await bot.createTable(botId, table.name, table.schema)
      } catch (thrown) {
        throw errors.BotpressCLIError.wrap(thrown, `table "${table.name}": create failed`)
      }
      created++
      cloudInfo(`  ${table.name}: created`)
    }
    cloudInfo(`tables synchronized (${created} created, ${declared.length - created} up to date)`)
  }

  private _writeAdkLastDeploy(dir: string, rec: { botId: string; sha256: string; at: string }): void {
    const outDir = path.join(dir, '.brt')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'last-deploy.json'), JSON.stringify(rec, null, 2) + '\n')
  }
}
