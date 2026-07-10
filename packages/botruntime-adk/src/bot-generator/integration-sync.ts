import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { AgentProject } from '../agent-project/agent-project.js'
import { resolveWorkspaceCredentials } from '../auth/index.js'
import type { ServerConnectionCredentials } from '../auth/index.js'
import { getIntegrationAlias, bpModuleDirName } from '../utils/ids.js'
import { BpAddCommand } from '../commands/bp-add-command.js'
import type { DependencyInstaller } from './generator.js'
import { inspectDependencyModule } from '../dependencies/module-identity.js'
import type { ServerConfigTarget } from '../integrations/config-utils.js'
import { resolveSyncCredentials } from './sync-credentials.js'

export interface IntegrationInfo {
  alias: string
  name: string
  version: string
  fullVersion: string // e.g., "slack@2.5.5"
}

export interface SyncResult {
  synced: IntegrationInfo[]
  errors: Array<{ alias: string; error: string }>
}

export interface IntegrationSyncOptions {
  adkCommand?: 'adk-dev' | 'adk-build' | 'adk-deploy'
  configTarget?: ServerConfigTarget
  credentials?: ServerConnectionCredentials
  installer?: DependencyInstaller
  /** Operation-scoped project shared by generateBotProject. */
  projectPromise?: Promise<AgentProject>
}

export class IntegrationSync {
  private projectPath: string
  private botProjectPath: string
  private bpModulesPath: string
  private adkCommand?: IntegrationSyncOptions['adkCommand']
  private configTarget?: ServerConfigTarget
  private credentials?: ServerConnectionCredentials
  private installer?: DependencyInstaller
  private projectPromise?: Promise<AgentProject>
  // Memoized so the per-item install loop resolves credentials once, not once
  // per integration (each resolution reloads + parses the agent project).
  private credentialsPromise: ReturnType<typeof resolveWorkspaceCredentials> | null = null

  constructor(projectPath: string, botProjectPath: string, options: IntegrationSyncOptions = {}) {
    this.projectPath = projectPath
    this.botProjectPath = botProjectPath
    this.bpModulesPath = path.join(botProjectPath, 'bp_modules')
    this.adkCommand = options.adkCommand
    this.configTarget = options.configTarget
    this.credentials = resolveSyncCredentials(options.configTarget, options.credentials)
    this.installer = options.installer
    this.projectPromise = options.projectPromise
  }

  private loadProject(): Promise<AgentProject> {
    this.projectPromise ??= AgentProject.load(this.projectPath, {
      ...(this.adkCommand ? { adkCommand: this.adkCommand } : {}),
      ...(this.configTarget ? { configTarget: this.configTarget } : {}),
    })
    return this.projectPromise
  }

  private getCredentials(): ReturnType<typeof resolveWorkspaceCredentials> {
    if (!this.credentialsPromise) {
      this.credentialsPromise = (async () => {
        if (this.credentials) {
          return resolveWorkspaceCredentials({
            credentials: this.credentials,
            apiUrl: this.credentials.apiUrl,
            workspaceId: this.credentials.workspaceId,
          })
        }
        const project = await this.loadProject()
        return resolveWorkspaceCredentials({ project })
      })()
    }
    return this.credentialsPromise
  }

  /**
   * Parse agent.config.ts dependencies integrations into IntegrationInfo objects
   */
  private async parseIntegrations(): Promise<IntegrationInfo[]> {
    const project = await this.loadProject()
    const dependencies = project.dependencies

    if (!dependencies?.integrations) {
      return []
    }

    const integrations: IntegrationInfo[] = []

    for (const [alias, config] of Object.entries(dependencies.integrations)) {
      let version: string
      let name: string

      if (typeof config === 'string') {
        // Simple format: "openai@15.0.4"
        version = config
        const parts = version.split('@')
        name = parts[0] || ''
      } else {
        // Object format: { version: "slack@2.5.5", ... }
        version = config.version
        const parts = version.split('@')
        name = parts[0] || ''
      }

      integrations.push({
        alias: getIntegrationAlias(alias),
        name,
        version: version.split('@')[1] || 'latest',
        fullVersion: version,
      })
    }

    return integrations
  }

  /**
   * Check if an integration is already installed with the correct version
   */
  private async isIntegrationSynced(integration: IntegrationInfo): Promise<boolean> {
    return inspectDependencyModule({
      bpModulesDir: this.bpModulesPath,
      type: 'integration',
      alias: integration.alias,
      name: integration.name,
      version: integration.version,
    }).ready
  }

  /**
   * Install an integration using bp CLI
   */
  private async installIntegration(integration: IntegrationInfo): Promise<void> {
    const credentials = await this.getCredentials()
    const resource = `integration:${integration.fullVersion}`

    // In-process installer (brt agent build path) — no child process. The
    // execa `BpAddCommand` below is the standalone-library fallback only.
    if (this.installer) {
      await this.installer({
        resource,
        botPath: this.botProjectPath,
        workspaceId: credentials.workspaceId,
        credentials: {
          token: credentials.token,
          apiUrl: credentials.apiUrl,
        },
      })
      return
    }

    const command = new BpAddCommand({
      resource,
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
   * Rename integration folder from bp_modules/{name} to bp_modules/integration_{alias}
   */
  private async renameIntegrationFolder(integration: IntegrationInfo): Promise<void> {
    const sourceFolder = path.join(this.bpModulesPath, integration.name.replace(/[/_]/g, '-'))

    const targetFolder = path.join(this.bpModulesPath, bpModuleDirName('integration', integration.alias))

    if (!existsSync(sourceFolder)) {
      throw new AdkError({
        code: 'GENERATED_FOLDER_MISSING',
        message: `Integration folder not found: ${sourceFolder}`,
        expected: false,
      })
    }

    // Remove target folder if it exists
    if (existsSync(targetFolder)) {
      await fs.rm(targetFolder, { recursive: true, force: true })
    }

    // Rename source to target
    await fs.rename(sourceFolder, targetFolder)
  }

  /**
   * Remove existing integration folder
   */
  private async removeIntegrationFolder(alias: string): Promise<void> {
    const targetFolder = path.join(this.bpModulesPath, bpModuleDirName('integration', alias))

    if (existsSync(targetFolder)) {
      await fs.rm(targetFolder, { recursive: true, force: true })
    }
  }

  /**
   * Sync all integrations
   */
  async syncIntegrations(): Promise<SyncResult> {
    const integrations = await this.parseIntegrations()
    const synced: IntegrationInfo[] = []
    const errors: Array<{ alias: string; error: string }> = []

    if (integrations.length === 0) {
      return { synced, errors }
    }

    // Ensure bp_modules directory exists
    await fs.mkdir(this.bpModulesPath, { recursive: true })

    for (const integration of integrations) {
      try {
        const isAlreadySynced = await this.isIntegrationSynced(integration)

        if (isAlreadySynced) {
          synced.push(integration)
          continue
        }

        // Remove existing folder if version mismatch
        await this.removeIntegrationFolder(integration.alias)

        // Install the integration
        await this.installIntegration(integration)

        // Rename to our controlled name
        await this.renameIntegrationFolder(integration)

        synced.push(integration)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push({ alias: integration.alias, error: errorMsg })
      }
    }

    return { synced, errors }
  }
}
