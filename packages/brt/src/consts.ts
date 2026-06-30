import os from 'os'
import pathlib from 'path'
import { CLI_ROOT_DIR } from './root'

// configurable
export const productionBotpressDomain = 'botruntime.ru'
// distinct from production so an apiUrl is never misdetected as staging in link templates.
export const stagingBotpressDomain = 'staging.botruntime.ru'

export const defaultBotpressHome = pathlib.join(os.homedir(), '.brt')
export const defaultWorkDir = process.cwd()
export const defaultInstallPath = process.cwd()
export const defaultBotpressApiUrl = 'https://botruntime.ru'
export const defaultBotpressAppUrl = 'https://botruntime.ru'
export const defaultTunnelUrl = 'https://botruntime.ru'
export const defaultChatApiUrl = 'https://botruntime.ru'

// not configurable

export const cliRootDir = CLI_ROOT_DIR
export const installDirName = 'bp_modules'
export const outDirName = '.botpress'
export const distDirName = 'dist'
export const profileFileName = 'profiles.json'
export const defaultProfileName = 'default'

export const fromCliRootDir = {}

export const fromHomeDir = {
  globalCacheFile: 'global.cache.json',
}

export const fromOutDir = {
  distDir: distDirName,
  outFileCJS: pathlib.join(distDirName, 'index.cjs'),
  outFileESM: pathlib.join(distDirName, 'index.mjs'),
  implementationDir: 'implementation',
  pluginsDir: 'plugins',
  secretsDir: 'secrets',
  projectCacheFile: 'project.cache.json',
}

export const fromWorkDir = {
  integrationDefinition: 'integration.definition.ts',
  interfaceDefinition: 'interface.definition.ts',
  botDefinition: 'bot.definition.ts',
  pluginDefinition: 'plugin.definition.ts',
  entryPoint: pathlib.join('src', 'index.ts'),
  outDir: outDirName,
  distDir: pathlib.join(outDirName, fromOutDir.distDir),
  outFileCJS: pathlib.join(outDirName, fromOutDir.outFileCJS),
  outFileESM: pathlib.join(outDirName, fromOutDir.outFileESM),
  implementationDir: pathlib.join(outDirName, fromOutDir.implementationDir),
  pluginsDir: pathlib.join(outDirName, fromOutDir.pluginsDir),
  secretsDir: pathlib.join(outDirName, fromOutDir.secretsDir),
  projectCacheFile: pathlib.join(outDirName, fromOutDir.projectCacheFile),
}
