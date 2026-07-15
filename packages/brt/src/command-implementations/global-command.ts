import { z } from '@holocronlab/botruntime-sdk'
import type { YargsConfig } from '@holocronlab/botruntime-yargs-extra'
import chalk from 'chalk'
import * as fs from 'fs'
import _ from 'lodash'
import semver from 'semver'
import type { ApiClientFactory } from '../api/client'
import * as config from '../config'
import * as consts from '../consts'
import * as errors from '../errors'
import type { CommandArgv, CommandDefinition } from '../typings'
import * as utils from '../utils'
import { fetchLatestPublicVersion, publicRegistryUrl } from '../public-package-version'
import { BaseCommand } from './base-command'

export type GlobalCommandDefinition = CommandDefinition<typeof config.schemas.global>
export type GlobalCache = { apiUrl: string; token: string; workspaceId: string; activeProfile: string }

export type ConfigurableGlobalPaths = {
  botpressHomeDir: string
  cliRootDir: utils.path.AbsolutePath
  profilesPath: string
}
export type ConstantGlobalPaths = typeof consts.fromHomeDir & typeof consts.fromCliRootDir
export type AllGlobalPaths = ConfigurableGlobalPaths & ConstantGlobalPaths

// internalToken is optional and NOT written by any command in this fork (mirrors
// the (deleted) thin brt CLI's rc.ts Profile.internalToken: an operator-managed
// field, hand-added to profiles.json, that unlocks the /internal/* cloudapi
// surface — see `brt deploy --adk`'s post-deploy bundle round-trip verification
// in deploy-command.ts). Declared here (rather than left unknown) so it is
// never silently stripped by this schema's default zod "strip" parsing.
const profileCredentialSchema = z.object({
  apiUrl: z.string(),
  workspaceId: z.string(),
  token: z.string(),
  internalToken: z.string().optional(),
})
export type ProfileCredentials = z.infer<typeof profileCredentialSchema>

class GlobalPaths extends utils.path.PathStore<keyof AllGlobalPaths> {
  public constructor(argv: CommandArgv<GlobalCommandDefinition>) {
    const absBotpressHome = utils.path.absoluteFrom(utils.path.cwd(), argv.botpressHome)
    super({
      cliRootDir: consts.cliRootDir,
      botpressHomeDir: absBotpressHome,
      profilesPath: utils.path.absoluteFrom(absBotpressHome, consts.profileFileName),
      ..._.mapValues(consts.fromHomeDir, (p) => utils.path.absoluteFrom(absBotpressHome, p)),
      ..._.mapValues(consts.fromCliRootDir, (p) => utils.path.absoluteFrom(consts.cliRootDir, p)),
    })
  }
}

export abstract class GlobalCommand<C extends GlobalCommandDefinition> extends BaseCommand<C> {
  protected api: ApiClientFactory
  protected prompt: utils.prompt.CLIPrompt
  private _pkgJson: utils.pkgJson.PackageJson | undefined

  public constructor(
    api: ApiClientFactory,
    prompt: utils.prompt.CLIPrompt,
    ...args: ConstructorParameters<typeof BaseCommand<C>>
  ) {
    super(...args)
    this.api = api
    this.prompt = prompt
  }

  protected get globalPaths() {
    return new GlobalPaths(this.argv)
  }

  protected get globalCache() {
    return new utils.cache.FSKeyValueCache<GlobalCache>(this.globalPaths.abs.globalCacheFile)
  }

  protected override async bootstrap() {
    const pkgJson = await this.readCLIPkgJson()
    const versionText = chalk.bold(`v${pkgJson.version}`)
    this.logger.log(`botruntime CLI ${versionText}`, { prefix: '🤖' })

    await this._notifyUpdateCli()

    const paths = this.globalPaths
    if (paths.abs.botpressHomeDir !== consts.defaultBotpressHome) {
      this.logger.log(`Using custom botruntime home: ${paths.abs.botpressHomeDir}`, { prefix: '🏠' })
    }
  }

  protected override teardown = async () => {
    this.logger.cleanup()
  }

  protected async getAuthenticatedClient(credentials: Partial<YargsConfig<typeof config.schemas.credentials>>) {
    try {
      const cache = this.globalCache

      let token: string | undefined
      let workspaceId: string | undefined
      let apiUrl: string | undefined

      if (this.argv.profile) {
        if (credentials.token || credentials.workspaceId || credentials.apiUrl) {
          this.logger.warn(
            'You are currently using credential command line arguments or environment variables as well as a profile. Your profile has overwritten the variables'
          )
        }
        ;({ token, workspaceId, apiUrl } = await this.readProfileFromFS(this.argv.profile))
        this.logger.log(`Using profile "${this.argv.profile}"`, { prefix: '👤' })
      } else {
        token = credentials.token ?? (await cache.get('token'))
        workspaceId = credentials.workspaceId ?? (await cache.get('workspaceId'))
        apiUrl = credentials.apiUrl ?? (await cache.get('apiUrl'))
      }

      if (!(token && workspaceId && apiUrl)) {
        return null
      }

      if (apiUrl !== consts.defaultBotpressApiUrl) {
        this.logger.log(`Using custom url ${apiUrl}`, { prefix: '🔗' })
      }

      return this.api.newClient({ apiUrl, token, workspaceId }, this.logger)
    } catch (thrown) {
      throw errors.BotpressCLIError.wrap(thrown, 'failed to create authenticated client')
    }
  }

  protected async readProfileFromFS(profile: string): Promise<ProfileCredentials> {
    const parsedProfiles = await this.readProfilesFromFS()

    const profileData = parsedProfiles[profile]
    if (!profileData) {
      throw new errors.BotpressCLIError(
        `Profile "${profile}" not found in "${this.globalPaths.abs.profilesPath}". Found profiles '${Object.keys(parsedProfiles).join("', '")}'.`
      )
    }

    return profileData
  }

  protected async readProfilesFromFS(): Promise<Record<string, ProfileCredentials>> {
    if (!fs.existsSync(this.globalPaths.abs.profilesPath)) {
      throw new errors.BotpressCLIError(`Profile file not found at "${this.globalPaths.abs.profilesPath}"`)
    }
    const fileContent = await fs.promises.readFile(this.globalPaths.abs.profilesPath, 'utf-8')
    const jsonParseResult = utils.json.safeParseJson(fileContent)
    if (!jsonParseResult.success) {
      throw new errors.BotpressCLIError(`Error parsing profiles file: ${jsonParseResult.error.message}`)
    }

    const zodParseResult = z.record(profileCredentialSchema).safeParse(jsonParseResult.data)
    if (!zodParseResult.success) {
      throw errors.BotpressCLIError.wrap(zodParseResult.error, 'Error parsing profiles: ')
    }

    return zodParseResult.data
  }

  protected async writeProfileToFS(profileName: string, profile: ProfileCredentials): Promise<void> {
    let profiles: Record<string, ProfileCredentials>
    if (fs.existsSync(this.globalPaths.abs.profilesPath)) {
      profiles = await this.readProfilesFromFS()
    } else {
      profiles = {}
    }
    profiles[profileName] = profile

    await fs.promises.writeFile(
      this.globalPaths.abs.profilesPath,
      JSON.stringify({ [consts.defaultProfileName]: profiles.defaultProfileName, ...profiles }, null, 2),
      'utf-8'
    )
  }

  protected async ensureLoginAndCreateClient(credentials: YargsConfig<typeof config.schemas.credentials>) {
    const client = await this.getAuthenticatedClient(credentials)

    if (client === null) {
      throw new errors.NotLoggedInError()
    }

    return client
  }

  private readonly _notifyUpdateCli = async (): Promise<void> => {
    // Bootstrap must not create hidden network traffic in unit tests. Apart
    // from making assertions nondeterministic, test fetch stubs may contain
    // deliberately sensitive failures that must never reach CLI logs.
    if (process.env.VITEST || process.env.NODE_ENV === 'test') return
    try {
      this.logger.debug('Checking if cli is up to date')

      const pkgJson = await this.readCLIPkgJson()
      if (!pkgJson.version) {
        throw new errors.BotpressCLIError('Could not find version in package.json')
      }

      const latest = await fetchLatestPublicVersion(pkgJson.name, publicRegistryUrl())
      const isOutdated = semver.lt(pkgJson.version, latest)
      if (isOutdated) {
        this.logger.box(
          [
            `${chalk.bold('Update available')} ${chalk.dim(pkgJson.version)} → ${chalk.green(latest)}`,
            '',
            'To update, run:',
            `  for npm  ${chalk.cyan(`npm i -g ${pkgJson.name}`)}`,
            `  for yarn ${chalk.cyan(`yarn global add ${pkgJson.name}`)}`,
            `  for pnpm ${chalk.cyan(`pnpm i -g ${pkgJson.name}`)}`,
          ].join('\n')
        )
      }
    } catch {
      // Registry/network error bodies and messages are untrusted and may
      // contain credentials from a proxy. Keep the optional check fail-open
      // without reflecting them, even in verbose mode.
      this.logger.debug('Failed to check if cli is up to date')
    }
  }

  protected async readCLIPkgJson(): Promise<utils.pkgJson.PackageJson> {
    if (this._pkgJson) {
      return this._pkgJson
    }
    const { cliRootDir } = this.globalPaths.abs
    const pkgJson = await utils.pkgJson.readPackageJson(cliRootDir).catch((thrown) => {
      throw errors.BotpressCLIError.wrap(thrown, `Failed to read CLI package.json file at "${cliRootDir}"`)
    })

    if (!pkgJson) {
      throw new errors.BotpressCLIError(`Could not find package.json at "${cliRootDir}"`)
    }

    this._pkgJson = pkgJson
    return pkgJson
  }
}
