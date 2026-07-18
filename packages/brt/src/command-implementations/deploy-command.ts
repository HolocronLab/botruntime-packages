import * as client from '@holocronlab/botruntime-client'
import * as sdk from '@holocronlab/botruntime-sdk'
import chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import semver from 'semver'
import * as apiUtils from '../api'
import { CloudapiClient } from '../api/cloudapi-client'
import * as agentLink from '../adk-agent-link'
import * as adkBundle from '../adk-bundle'
import * as botsStore from '../bots-store'
import { cloudInfo, cloudWarn } from '../cloud-io'
import * as cloudProfileResolve from '../cloud-profile-resolve'
import * as cloudLink from '../cloud-project-link'
import type commandDefinitions from '../command-definitions'
import type { CommandArgv } from '../typings'
import * as declaredCommands from '../declared-commands'
import * as errors from '../errors'
import {
  assertPlatformToolchainCompatible,
  inspectPlatformToolchain,
  validatePlatformToolchainArtifact,
  writePlatformToolchainContract,
} from '../toolchain-contract'
import { pendingIntegrationRegistrationCommands } from '../integration-guidance'
import * as tableSync from '../adk-table-sync'
import * as tables from '../tables'
import * as utils from '../utils'
import { AddCommand, type AddCommandDefinition } from './add-command'
import { BuildCommand } from './build-command'
import { ProjectCommand, ProjectDefinitionContext } from './project-command'
import type { ProfileCredentials } from './global-command'

const ADK_DEPLOY_WATCH_DEBOUNCE_MS = 500

function validateProvisionResponse(
  value: unknown,
  expectedWorkspaceId: string
): { botId: string; apiKey: string; workspaceId: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new errors.BotpressCLIError('invalid provision response: expected an object')
  }
  const response = value as Record<string, unknown>
  const botId = (() => {
    if (typeof response['botId'] === 'number') {
      if (Number.isSafeInteger(response['botId']) && response['botId'] > 0) return String(response['botId'])
      return undefined
    }
    if (typeof response['botId'] === 'string' && /^[1-9][0-9]*$/.test(response['botId'])) {
      return response['botId']
    }
    return undefined
  })()
  if (!botId) {
    throw new errors.BotpressCLIError('invalid provision response: botId must be a positive decimal string or safe integer')
  }
  const apiKey = response['apiKey']
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new errors.BotpressCLIError('invalid provision response: apiKey must be a non-empty string')
  }
  const returnedWorkspaceId = (() => {
    if (typeof response['workspaceId'] === 'number' && Number.isSafeInteger(response['workspaceId'])) {
      return String(response['workspaceId'])
    }
    if (typeof response['workspaceId'] === 'string' && response['workspaceId'].length > 0) {
      return response['workspaceId']
    }
    return undefined
  })()
  if (!returnedWorkspaceId || returnedWorkspaceId !== expectedWorkspaceId) {
    throw new errors.BotpressCLIError(
      `invalid provision response: workspaceId must equal requested workspace ${expectedWorkspaceId}`
    )
  }
  return { botId, apiKey, workspaceId: returnedWorkspaceId }
}

export type DeployCommandDefinition = typeof commandDefinitions.deploy
export class DeployCommand extends ProjectCommand<DeployCommandDefinition> {
  protected override async bootstrap(): Promise<void> {
    this._validateWatchOptions()
    await super.bootstrap()
  }

  private _validateWatchOptions(): void {
    if (
      this.argv.adk &&
      (this.argv.token !== undefined || this.argv.workspaceId !== undefined || this.argv.apiUrl !== undefined)
    ) {
      const unsupported = [
        this.argv.token !== undefined ? '--token' : undefined,
        this.argv.workspaceId !== undefined ? '--workspace-id' : undefined,
        this.argv.apiUrl !== undefined ? '--api-url' : undefined,
      ].filter((flag): flag is string => flag !== undefined)
      throw new errors.BotpressCLIError(
        `\`brt deploy --adk\` uses the selected profile as its credential authority; remove ${unsupported.join(' and ')}`
      )
    }
    if (this.argv.adk && this.argv.dryRun) {
      throw new errors.BotpressCLIError(
        '`brt deploy --adk --dry-run` is not supported: a side-effect-free agent deployment plan does not exist yet. ' +
          'Remove `--dry-run` to perform a real agent deployment.'
      )
    }
    if (this.argv.watch && !this.argv.adk) {
      throw new errors.BotpressCLIError('`brt deploy --watch` requires `--adk`')
    }
    if (this.argv.watch && this.argv.noBuild) {
      throw new errors.BotpressCLIError('`brt deploy --adk --watch` cannot be combined with `--noBuild`')
    }
  }

  public async run(): Promise<void> {
    // Keep direct programmatic callers as safe as the normal handler/bootstrap path.
    this._validateWatchOptions()

    // --adk gates the bespoke-cloudapi-wire ADK-bundle deploy path (ported
    // from the (deleted) thin brt CLI's commands/deploy.ts). This is a
    // SEPARATE surface from the Botpress-shaped deploy below: it targets an
    // agent.json/agent.local.json-linked bot via CloudapiClient instead of
    // @holocronlab/botruntime-client, and never touches botDefinition.ts or
    // integration.definition.ts. The classic deploy remains unchanged.
    if (this.argv.adk) {
      if (this.argv.watch) {
        return this._watchAdkDeploy()
      }
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
    if (!fs.existsSync(this.projectPaths.abs.outFileCJS)) {
      throw new errors.BotpressCLIError(
        `Integration bundle not found at ${this.projectPaths.abs.outFileCJS}. Remove --noBuild to build it before deployment.`
      )
    }

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
        `Integration ${name} v${version} is already public. Reusing this version will override it; publish a new version for contract changes.`
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

      apiUtils.assertNetworkDeclared(integrationDef)
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
  // brt deploy --adk --watch — explicit production-like cloud redeploy loop.
  // A plain deploy --adk remains one-shot; this path performs the same deploy
  // once initially, then repeats it only for agent source changes.
  // ---------------------------------------------------------------------
  private async _watchAdkDeploy(): Promise<void> {
    const dir = this.projectPaths.abs.workDir
    let deploying = false
    let dirty = false

    const redeploy = async (): Promise<void> => {
      if (deploying) {
        dirty = true
        return
      }

      deploying = true
      let lastFailure: { error: unknown } | undefined
      try {
        do {
          dirty = false
          try {
            await this._deployAdkBundle()
            lastFailure = undefined
          } catch (error) {
            lastFailure = { error }
          }
        } while (dirty)

        if (lastFailure) throw lastFailure.error
      } finally {
        deploying = false
      }
    }

    const watcher = await utils.filewatcher.FileWatcher.watch(
      dir,
      async (events) => {
        if (!events.some((event) => adkBundle.isAgentSourceChange(dir, event.path, { dependencyEnv: 'prod' }))) return

        this.logger.log('Agent source changed, rebuilding + redeploying')
        try {
          await redeploy()
        } catch (thrown) {
          const err = errors.BotpressCLIError.wrap(thrown, 'brt deploy --adk --watch: redeploy failed')
          this.logger.error(err.message)
          this.logger.debug(errors.BotpressCLIError.fullStack(err))
        }
      },
      { debounceMs: ADK_DEPLOY_WATCH_DEBOUNCE_MS }
    )

    try {
      cloudInfo(`brt deploy --adk --watch: building + deploying ${dir} ...`)
      await redeploy().catch((thrown) => {
        throw errors.BotpressCLIError.wrap(thrown, 'brt deploy --adk --watch: initial deploy failed')
      })
      cloudInfo(
        'brt deploy --adk --watch: live. The runtime-host supervisor will hot-swap after each successful deployment.'
      )

      await watcher.wait()
    } finally {
      await watcher.close()
    }
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
  private async _buildAdkBundle(
    dir: string,
    configTargetBotId: string,
    credentials: { token: string; apiUrl: string; workspaceId: string }
  ): Promise<string> {
    // In-process dependency installer: instead of spawning a provisioned brt
    // CLI subprocess to add each integration/plugin/interface into the generated
    // bot's bp_modules, drive brt's OWN native AddCommand as a plain function
    // call. `resource` is already a package ref in brt's grammar
    // (`integration:name@ver` | `plugin:…` | `interface:…`), so it maps
    // directly onto the `add` positional `packageRef`. Credentials come from
    // the ADK-side resolveWorkspaceCredentials (the same explicit token/apiUrl/
    // workspaceId the former execa subprocess received) — passed explicitly and
    // with no `profile`, so the add uses exactly those creds. `confirm: true`
    // suppresses interactive prompts; no `alias`, so each package installs
    // under its native name and the ADK sync then renames the folder, exactly
    // as it did after the spawned add.
    const installer: adkBundle.DependencyInstaller = async ({ resource, botPath, workspaceId, credentials }) => {
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

    const botPath = await adkBundle.generateAgentBot(dir, installer, {
      // Keep the shipping dependency snapshot semantics of adk-build while
      // pinning remote config to the canonical bot resolved by this deploy.
      adkCommand: 'adk-build',
      configTarget: { environment: 'prod', botId: configTargetBotId, credentials },
    })

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
    // Resolve the physical package graph before loading ADK code or touching
    // Cloud state. A stale/hoisted platform package must fail here, not later
    // as an unrelated runtime or eval error after provisioning.
    const toolchainContract = inspectPlatformToolchain(dir)
    assertPlatformToolchainCompatible(toolchainContract)
    // Load and validate recurring metadata before provisioning. The server
    // synchronizes these durable schedules atomically with the deployed bot.
    const recurringEvents = await adkBundle.loadAgentRecurringEvents(dir)
    const usesLocalTarget = Boolean(this.argv.local)
    // Target files are environment-isolated. A local deploy never reads or
    // writes agent.json; a production deploy never lets agent.local.json
    // override its coordinates. bot.json remains a one-release fallback only
    // when the canonical production agent.json does not exist.
    const agentInfo = usesLocalTarget ? undefined : agentLink.readAgentInfoIfPresent(dir)
    const agentLocalInfo = usesLocalTarget ? agentLink.readAgentLocalInfo(dir) : undefined
    const legacyLink: cloudLink.BotLink =
      !usesLocalTarget && agentInfo === undefined ? (cloudLink.loadLinkIfPresent(dir, 'prod') ?? {}) : {}

    const { name: profileName, profile } = await cloudProfileResolve.resolveProfile({
      argvProfile: this.argv.profile,
      getActiveProfile: () => this.globalCache.get('activeProfile'),
      readProfile: (n) => this.readProfileFromFS(n),
    })
    if (usesLocalTarget) {
      cloudProfileResolve.assertProfileAuthority('agent.local.json', agentLocalInfo ?? {}, profile, {
        requireCoordinates: true,
      })
    }
    let selectedApiUrl: string | undefined
    let apiUrl: string
    let workspaceId: string
    if (usesLocalTarget) {
      if (!agentLocalInfo?.apiUrl) {
        throw new errors.BotpressCLIError(
          'agent.local.json has no apiUrl — `brt deploy --adk --local` never falls back to the selected profile stack'
        )
      }
      if (!agentLocalInfo.workspaceId) {
        throw new errors.BotpressCLIError(
          'agent.local.json has no workspaceId — `brt deploy --adk --local` never falls back to the selected profile stack'
        )
      }
      apiUrl = agentLocalInfo.apiUrl.replace(/\/+$/, '')
      workspaceId = agentLocalInfo.workspaceId
    } else {
      // A legacy bot.json may identify the bot during one-time migration, but
      // it is repository-controlled input and must never redirect the selected
      // profile PAT to another host.
      selectedApiUrl = cloudProfileResolve.resolveApiUrl(this.argv.apiUrl, profile)
      cloudProfileResolve.assertProfileAuthority(
        'command target override',
        { apiUrl: selectedApiUrl, workspaceId: profile.workspaceId },
        profile,
        { requireCoordinates: true }
      )
      apiUrl = selectedApiUrl
      workspaceId = profile.workspaceId
    }
    const botsStorePath = this.globalPaths.abs.botsStoreFile

    const resolvedBotId = usesLocalTarget
      ? (this.argv.botId ?? agentLocalInfo?.botId)
      : agentLink.resolveAgentBotId(this.argv.botId, agentInfo, legacyLink.botId)

    // Deploy is workspace-scoped (Botpress parity): the bundle PUT and table
    // sync go under the workspace PAT (profile.token) + x-workspace-id, so a
    // profile with no workspaceId cannot deploy. Fail loud here rather than let
    // the server 400/404 after we have already built the bundle.
    if (!workspaceId) {
      throw new errors.BotpressCLIError(
        `profile "${profileName}" has no workspaceId — re-run \`brt login\` (deploy is workspace-scoped)`
      )
    }

    if (
      !usesLocalTarget &&
      agentInfo === undefined &&
      legacyLink.workspaceId !== undefined &&
      String(legacyLink.workspaceId) !== workspaceId
    ) {
      throw new errors.BotpressCLIError(
        `bot.json workspaceId=${legacyLink.workspaceId} does not match selected profile "${profileName}" workspaceId=${workspaceId}`
      )
    }

    if (agentInfo?.workspaceId !== undefined && agentInfo.workspaceId !== profile.workspaceId) {
      throw new errors.BotpressCLIError(
        `agent.json workspaceId=${agentInfo.workspaceId} does not match selected profile "${profileName}" workspaceId=${profile.workspaceId}`
      )
    }
    const canonicalApiUrl = agentInfo?.apiUrl?.replace(/\/+$/, '')
    if (canonicalApiUrl !== undefined && canonicalApiUrl !== selectedApiUrl) {
      throw new errors.BotpressCLIError(
        `agent.json apiUrl=${canonicalApiUrl} does not match selected profile "${profileName}" apiUrl=${selectedApiUrl}`
      )
    }

    // --noBuild is artifact reuse, never a provisioning shortcut. Resolve the
    // target before touching BRT_BUNDLE_PATH so a fresh project fails without
    // reading arbitrary bundle paths, creating a bot, or writing credentials.
    if (this.argv.noBuild && (!resolvedBotId || resolvedBotId.trim() === '')) {
      throw new errors.BotpressCLIError(
        '`brt deploy --adk --noBuild` requires an existing linked target (or an explicit --bot-id); rebuild with a normal deploy first'
      )
    }
    const hasExplicitBotId = this.argv.botId !== undefined
    if (
      hasExplicitBotId &&
      (this.argv.botId === '' || this.argv.botId !== this.argv.botId.trim())
    ) {
      throw new errors.BotpressCLIError('`brt deploy --adk --bot-id` must be a non-empty exact bot id')
    }

    // Stale-migration guard: our cloudapi resolves bots by a NUMERIC id, but a
    // bot migrated off Botpress Cloud still carries a UUID botId in agent.json.
    // A non-numeric id can never deploy here (guaranteed 404), so make the
    // config error visible immediately with an actionable message instead of
    // proceeding into that 404. (Skipped for explicit --bot-id overrides and
    // for Botpress Cloud targets — see checkDeployableBotId.)
    const botIdError = agentLink.checkDeployableBotId(resolvedBotId, this.argv.botId, apiUrl)
    if (botIdError) {
      throw new errors.BotpressCLIError(botIdError)
    }

    const bundleTarget = resolvedBotId
      ? { apiUrl, workspaceId, botId: resolvedBotId }
      : undefined
    const verifiedNoBuildBundle = this.argv.noBuild
      ? (() => {
          const bundlePath = adkBundle.requireExistingBundle(dir)
          const verified = adkBundle.validateBundleProvenance(bundlePath, bundleTarget!)
          validatePlatformToolchainArtifact(dir, toolchainContract, verified.sha256)
          return { path: bundlePath, code: verified.code, sha256: verified.sha256 }
        })()
      : undefined
    // A normal-deploy override is an explicit trusted escape from the native
    // build. Read it once before provisioning so a missing/directory/unreadable
    // path cannot leave a freshly created bot behind, and retain those exact
    // bytes for the later PUT.
    const trustedOverrideBundle = this.argv.noBuild ? undefined : adkBundle.readBundlePathOverride()
    if (trustedOverrideBundle) {
      cloudWarn(
        'BRT_BUNDLE_PATH is explicitly trusted for this agent deployment; bundle provenance verification is bypassed.'
      )
    }

    let botId: string
    if (resolvedBotId === undefined) {
      // 1. provision once (no botId anywhere yet, and no --bot-id override).
      // Persist the per-bot key BEFORE the link, atomically, so a crash leaves
      // a recoverable bot rather than an orphan with a lost key. The key is NOT
      // used to deploy (deploy is under the workspace PAT, below) — it is kept
      // only for operations that still need a per-bot principal.
      cloudInfo(`provision new bot on ${apiUrl} ...`)
      const machineClient = new CloudapiClient(apiUrl, profile.token)
      const prov = validateProvisionResponse(
        await machineClient.provisionBot(this.argv.name, workspaceId),
        workspaceId
      )
      botId = prov.botId
      const perBotKey = prov.apiKey

      const store = botsStore.readBotsStore(botsStorePath)
      botsStore.setBotCreds(store, profileName, botId, { apiKey: perBotKey })
      botsStore.writeBotsStore(botsStorePath, store)

      if (usesLocalTarget) {
        agentLink.writeAgentLocalInfo(dir, { botId, workspaceId: prov.workspaceId, apiUrl })
      } else {
        agentLink.writeAgentInfo(dir, { botId, workspaceId: prov.workspaceId, apiUrl })
      }
      cloudInfo(`provisioned botId=${botId} workspaceId=${prov.workspaceId}`)
    } else {
      botId = resolvedBotId

      // AUTO-MIGRATE (one-time): bot.json already links a bot but agent.json
      // is absent — write agent.json from bot.json so it becomes canonical
      // from here on. Keeps reading bot.json as fallback for one release.
      const migrated = usesLocalTarget || hasExplicitBotId
        ? undefined
        : agentLink.computeAutoMigrateInfo(agentInfo, legacyLink, resolvedBotId, workspaceId, apiUrl)
      if (migrated) {
        agentLink.writeAgentInfo(dir, migrated)
        cloudInfo(`migrated legacy bot.json -> agent.json (botId=${migrated.botId})`)
      }

      // No per-bot key is read here: an already-linked bot deploys under the
      // workspace PAT. bots.json remains the store for the per-bot principal
      // that legacy bot-scoped commands may still need.
    }

    const { migrateFromConfig } = await adkBundle.loadAdkMigrationTools()
    const migrationApi = this.api.newClient(
      { token: profile.token, apiUrl, workspaceId },
      this.logger
    )
    await migrateFromConfig({
      projectPath: dir,
      client: migrationApi.client as unknown as Parameters<typeof migrateFromConfig>[0]['client'],
      target: { env: 'prod', apiUrl, workspaceId, botId },
      authority: hasExplicitBotId
        ? { source: 'explicit', botId }
        : usesLocalTarget
          ? { source: 'agentLocalBot' }
          : { source: 'agent' },
    })

    // 2. build if needed — in-process: generate the synthetic classic bot with
    // the @holocronlab/botruntime-adk library, then build it with brt's OWN
    // native pipeline. No child process to any adk/bp binary.
    let bundle: adkBundle.LoadedBundle
    if (verifiedNoBuildBundle) {
      bundle = verifiedNoBuildBundle
    } else if (trustedOverrideBundle) {
      bundle = trustedOverrideBundle
    } else {
      const canonicalBundlePath = path.join(dir, adkBundle.ADK_BUNDLE_REL_PATH)
      // A failed rebuild must not leave an older sidecar authorizing stale
      // bytes for a later --noBuild retry.
      adkBundle.invalidateBundleProvenance(canonicalBundlePath)
      const bundlePath = await adkBundle.ensureBundle(() =>
        this._buildAdkBundle(dir, botId, {
          token: profile.token,
          apiUrl,
          workspaceId,
        })
      )
      if (bundlePath !== canonicalBundlePath) {
        adkBundle.invalidateBundleProvenance(bundlePath)
      }
      const code = await fs.promises.readFile(bundlePath, 'utf-8')
      const localHash = adkBundle.sha256(code)
      adkBundle.writeBundleProvenance(bundlePath, { apiUrl, workspaceId, botId }, code)
      writePlatformToolchainContract(dir, toolchainContract, { bundleSha256: localHash })
      bundle = { path: bundlePath, code, sha256: localHash }
    }
    const { path: bundlePath, code, sha256: localHash } = bundle
    cloudInfo(`bundle ${bundlePath} (${code.length} bytes, sha256 ${localHash.slice(0, 12)}…)`)

    const commands = declaredCommands.extractDeclaredCommands(dir)
    cloudInfo(
      commands.length === 0 ? 'commands: none declared' : `commands: ${commands.map((c) => '/' + c.command).join(', ')}`
    )

    // 3. PUT bundle under the workspace PAT (profile.token) — Botpress parity.
    // The server resolves the bot by its numeric id within profile.workspaceId
    // and gates owner|admin; the CLI no longer reads the per-bot key to deploy.
    const bot = new CloudapiClient(apiUrl, profile.token)
    cloudInfo(`deploy -> PUT ${apiUrl}/v1/admin/bots/${botId} (workspace ${workspaceId})`)
    await bot.putBundle(botId, this.argv.name ?? botId, code, commands, workspaceId, recurringEvents)

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

    // 5. synchronize tables (mirrors the Botpress-shaped deploy's own
    // bundle-then-tables order above): without this step the bot's first
    // table write 404s and the web console shows no tables.
    await this._syncAdkTables(
      dir,
      apiUrl,
      botId,
      { ...profile, apiUrl, workspaceId },
      { botId, workspaceId, apiUrl }
    )

    this._writeAdkLastDeploy(dir, { botId, sha256: localHash, at: new Date().toISOString() })

    cloudInfo('deploy OK.')
    try {
      const { installations } = await bot.listWorkspaceIntegrations(workspaceId, botId)
      for (const command of pendingIntegrationRegistrationCommands(installations)) {
        cloudInfo(`next: ${command}`)
      }
    } catch (thrown) {
      cloudWarn(`integration registration status unavailable: ${thrown instanceof Error ? thrown.message : String(thrown)}`)
    }
  }

  // _syncAdkTables — full, unconditional schema sync (Botpress parity) through
  // @holocronlab/botruntime-adk's TableManager (packages/botruntime-adk/src/
  // tables/table-manager.ts) — the SAME diff/apply engine PreflightChecker
  // already wires for computeDeployPlan (preflight/checker.ts). Replaces the
  // old create-only botruntime.tables.json manifest entirely: create, update
  // (incl. rename/remove/modify columns), and delete of orphaned tables are
  // all now in scope, gated through adk-table-sync.ts's confirm/logging layer.
  //
  // project.tables gate mirrors PreflightChecker.computeDeployPlan's own
  // `project.tables.length > 0 ? new TableManager(...) : null` — a bot that
  // declares zero tables never even lists remote ones.
  private async _syncAdkTables(
    dir: string,
    apiUrl: string,
    botId: string,
    profile: ProfileCredentials,
    agentInfo: agentLink.AgentInfo | undefined
  ): Promise<void> {
    const { AgentProject, TableManager } = await adkBundle.loadAdkTableManager()
    const workspaceId = profile.workspaceId
    if (!workspaceId) {
      throw new errors.BotpressCLIError('ADK table sync requires an authoritative workspaceId')
    }
    const credentials = { token: profile.token, apiUrl, workspaceId }
    // --noBuild has no prior generator cache to inherit. Supplying the exact
    // deploy target here pins AgentProject's own online dependency resolution
    // before TableManager is constructed; a local override cannot redirect the
    // workspace PAT while the project is loading.
    const project = await AgentProject.load(dir, {
      adkCommand: 'adk-build',
      configTarget: { environment: 'prod', botId, credentials },
    })

    if (project.tables.length === 0) {
      cloudInfo('tables: none declared')
      return
    }

    // AgentProject always merges agent.local.json into agentInfo, even for an
    // adk-build load. TableManager later treats that merged value as higher
    // priority than explicit credentials. Shadow only agentInfo on a wrapper
    // so table declarations still come from the loaded project while all
    // network coordinates stay pinned to this deploy's already-validated
    // target. The underlying project and both link files remain untouched.
    const targetProject = Object.create(project) as typeof project
    Object.defineProperty(targetProject, 'agentInfo', {
      value: agentInfo,
      enumerable: true,
    })

    const tableManager = new TableManager({
      project: targetProject,
      botId,
      credentials,
    })

    // Every confirm() call inside syncAdkTables gates a destructive change
    // (column remove/modify, orphaned-table delete) — -y/--confirm must not
    // silently satisfy it (see createDestructiveTableConfirm). The real
    // interactive prompt still goes through confirmInteractive, which itself
    // ignores the -y bypass (prompt-utils.ts).
    const confirmDestructive = tableSync.createDestructiveTableConfirm({
      allowDestructive: Boolean(this.argv.allowDestructiveTableChanges),
      isTTY: Boolean(process.stdin.isTTY),
      promptConfirm: (message) => this.prompt.confirmInteractive(message),
    })

    await tableSync.syncAdkTables(tableManager, confirmDestructive, (line) => cloudInfo(line))
  }

  private _writeAdkLastDeploy(dir: string, rec: { botId: string; sha256: string; at: string }): void {
    const outDir = path.join(dir, '.brt')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'last-deploy.json'), JSON.stringify(rec, null, 2) + '\n')
  }
}
