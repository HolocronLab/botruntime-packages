import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { AgentProject } from '../agent-project/agent-project.js'
import { resolveWorkspaceCredentials } from '../auth/index.js'
import { bpModuleDirName } from '../utils/ids.js'
import { BpAddCommand } from '../commands/bp-add-command.js'

export interface PluginInfo {
  alias: string
  name: string
  version: string
  fullVersion: string // e.g., "hitl@1.3.0"
}

export interface PluginSyncResult {
  synced: PluginInfo[]
  errors: Array<{ alias: string; error: string }>
}

export interface PluginSyncOptions {
  adkCommand?: 'adk-dev' | 'adk-build' | 'adk-deploy'
}

export class PluginSync {
  private projectPath: string
  private botProjectPath: string
  private bpModulesPath: string
  private adkCommand?: PluginSyncOptions['adkCommand']
  // Memoized so the per-item install loop resolves credentials once, not once
  // per plugin (each resolution reloads + parses the agent project).
  private credentialsPromise: ReturnType<typeof resolveWorkspaceCredentials> | null = null

  constructor(projectPath: string, botProjectPath: string, options: PluginSyncOptions = {}) {
    this.projectPath = projectPath
    this.botProjectPath = botProjectPath
    this.bpModulesPath = path.join(botProjectPath, 'bp_modules')
    this.adkCommand = options.adkCommand
  }

  private getCredentials(): ReturnType<typeof resolveWorkspaceCredentials> {
    if (!this.credentialsPromise) {
      this.credentialsPromise = (async () => {
        const project = await AgentProject.load(
          this.projectPath,
          this.adkCommand ? { adkCommand: this.adkCommand } : {}
        )
        return resolveWorkspaceCredentials({ project })
      })()
    }
    return this.credentialsPromise
  }

  /**
   * Parse agent.config.ts dependencies plugins into PluginInfo objects
   */
  private async parsePlugins(): Promise<PluginInfo[]> {
    const project = await AgentProject.load(this.projectPath, this.adkCommand ? { adkCommand: this.adkCommand } : {})
    const dependencies = project.dependencies

    if (!dependencies?.plugins) {
      return []
    }

    const plugins: PluginInfo[] = []

    for (const [alias, config] of Object.entries(dependencies.plugins)) {
      const version = config.version
      const parts = version.split('@')
      const name = parts[0] || ''

      plugins.push({
        alias,
        name,
        version: parts[1] || 'latest',
        fullVersion: version,
      })
    }

    return plugins
  }

  /**
   * Check if a plugin is already installed with the correct version
   */
  private async isPluginSynced(plugin: PluginInfo): Promise<boolean> {
    const targetFolder = path.join(this.bpModulesPath, bpModuleDirName('plugin', plugin.alias))

    if (!existsSync(targetFolder)) {
      return false
    }

    try {
      const indexPath = path.join(targetFolder, 'index.ts')
      if (!existsSync(indexPath)) {
        return false
      }

      const indexContent = await fs.readFile(indexPath, 'utf-8')

      // Look for version in the format: version: "1.3.0",
      const versionMatch = indexContent.match(/version:\s*["']([^"']+)["']/)
      if (!versionMatch) {
        return false
      }

      const installedVersion = versionMatch[1]
      return installedVersion === plugin.version
    } catch {
      return false
    }
  }

  /**
   * Install a plugin using bp CLI
   */
  private async installPlugin(plugin: PluginInfo): Promise<void> {
    const credentials = await this.getCredentials()

    const command = new BpAddCommand({
      resource: `plugin:${plugin.fullVersion}`,
      botPath: this.botProjectPath,
      workspaceId: credentials.workspaceId,
      credentials: {
        token: credentials.token,
        apiUrl: credentials.apiUrl,
      },
    })

    await command.run()
    await command.output()
  }

  /**
   * Rename plugin folder from bp_modules/{name} to bp_modules/plugin_{alias}
   */
  private async renamePluginFolder(plugin: PluginInfo): Promise<void> {
    const sourceFolder = path.join(this.bpModulesPath, plugin.name.replace('/', '-'))
    const targetFolder = path.join(this.bpModulesPath, bpModuleDirName('plugin', plugin.alias))

    if (!existsSync(sourceFolder)) {
      throw new AdkError({
        code: 'GENERATED_FOLDER_MISSING',
        message: `Plugin folder not found: ${sourceFolder}`,
        expected: false,
      })
    }

    if (existsSync(targetFolder)) {
      await fs.rm(targetFolder, { recursive: true, force: true })
    }

    await fs.rename(sourceFolder, targetFolder)
  }

  /**
   * Remove existing plugin folder
   */
  private async removePluginFolder(alias: string): Promise<void> {
    const targetFolder = path.join(this.bpModulesPath, bpModuleDirName('plugin', alias))

    if (existsSync(targetFolder)) {
      await fs.rm(targetFolder, { recursive: true, force: true })
    }
  }

  /**
   * Sync all plugins
   */
  async syncPlugins(): Promise<PluginSyncResult> {
    const plugins = await this.parsePlugins()
    const synced: PluginInfo[] = []
    const errors: Array<{ alias: string; error: string }> = []

    if (plugins.length === 0) {
      return { synced, errors }
    }

    await fs.mkdir(this.bpModulesPath, { recursive: true })

    for (const plugin of plugins) {
      try {
        const isAlreadySynced = await this.isPluginSynced(plugin)

        if (isAlreadySynced) {
          synced.push(plugin)
          continue
        }

        // Remove existing folder if version mismatch
        await this.removePluginFolder(plugin.alias)

        // Install the plugin
        await this.installPlugin(plugin)

        // Rename to our controlled name
        await this.renamePluginFolder(plugin)

        synced.push(plugin)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push({ alias: plugin.alias, error: errorMsg })
      }
    }

    return { synced, errors }
  }
}
