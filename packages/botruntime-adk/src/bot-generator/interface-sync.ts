import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { AgentProject } from '../agent-project/agent-project.js'
import { resolveWorkspaceCredentials } from '../auth/index.js'
import type { ServerConnectionCredentials } from '../auth/index.js'
import { pascalCase } from '../utils/strings.js'
import { BUILTIN_INTERFACES } from '../constants.js'
import { BpAddCommand } from '../commands/bp-add-command.js'
import type { DependencyInstaller } from './generator.js'
import type { ServerConfigTarget } from '../integrations/config-utils.js'
import { resolveSyncCredentials } from './sync-credentials.js'

export interface InterfaceInfo {
  alias: string
  name: string
  version: string
  fullVersion: string // e.g., "translator@1.0.0"
}

export interface InterfaceSyncResult {
  synced: InterfaceInfo[]
  errors: Array<{ alias: string; error: string }>
}

export interface InterfaceSyncOptions {
  adkCommand?: 'adk-dev' | 'adk-build' | 'adk-deploy'
  configTarget?: ServerConfigTarget
  credentials?: ServerConnectionCredentials
  installer?: DependencyInstaller
  /** Operation-scoped project shared by generateBotProject. */
  projectPromise?: Promise<AgentProject>
}

export class InterfaceSync {
  private projectPath: string
  private botProjectPath: string
  private bpModulesPath: string
  private adkCommand?: InterfaceSyncOptions['adkCommand']
  private configTarget?: ServerConfigTarget
  private credentials?: ServerConnectionCredentials
  private installer?: DependencyInstaller
  private projectPromise?: Promise<AgentProject>
  // Memoized so the per-item install loop resolves credentials once, not once
  // per interface (each resolution reloads + parses the agent project).
  private credentialsPromise: ReturnType<typeof resolveWorkspaceCredentials> | null = null

  constructor(projectPath: string, botProjectPath: string, options: InterfaceSyncOptions = {}) {
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
   * Get built-in interfaces (hard-coded constants)
   */
  private async parseInterfaces(): Promise<InterfaceInfo[]> {
    const interfaces: InterfaceInfo[] = []

    for (const [alias, fullVersion] of Object.entries(BUILTIN_INTERFACES)) {
      const parts = fullVersion.split('@')
      const name = parts[0] || ''
      const version = parts[1] || 'latest'

      interfaces.push({
        alias,
        name,
        version,
        fullVersion,
      })
    }

    return interfaces
  }

  /**
   * Check if an interface is already installed with the correct version
   */
  private async isInterfaceSynced(interfaceInfo: InterfaceInfo): Promise<boolean> {
    const targetFolder = path.join(this.bpModulesPath, `interface_${pascalCase(interfaceInfo.alias)}`)

    if (!existsSync(targetFolder)) {
      return false
    }

    // Check if the index.ts has the correct version
    try {
      const indexPath = path.join(targetFolder, 'index.ts')
      if (!existsSync(indexPath)) {
        return false
      }

      const indexContent = await fs.readFile(indexPath, 'utf-8')

      // Look for version in the format: version: "1.0.0",
      const versionMatch = indexContent.match(/version:\s*["']([^"']+)["']/)
      if (!versionMatch) {
        return false
      }

      const installedVersion = versionMatch[1]
      return installedVersion === interfaceInfo.version
    } catch {
      return false
    }
  }

  /**
   * Install an interface using bp CLI
   */
  private async installInterface(interfaceInfo: InterfaceInfo): Promise<void> {
    const credentials = await this.getCredentials()
    const resource = `interface:${interfaceInfo.fullVersion}`

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

    return new Promise((resolve, reject) => {
      const command = new BpAddCommand({
        resource,
        botPath: this.botProjectPath,
        workspaceId: credentials.workspaceId,
        credentials: {
          token: credentials.token,
          apiUrl: credentials.apiUrl,
        },
      })

      let stderr = ''

      command.on('stderr', (data: string) => {
        stderr += data
      })

      command.on('error', (error: { message: string; stderr?: string }) => {
        reject(new Error(`Failed to install interface ${interfaceInfo.fullVersion}: ${error.stderr || error.message}`))
      })

      command.on('done', () => {
        resolve()
      })

      command.run().catch(reject)
    })
  }

  /**
   * Rename interface folder from bp_modules/{name} to bp_modules/interface_{PascalCaseAlias}
   */
  private async renameInterfaceFolder(interfaceInfo: InterfaceInfo): Promise<void> {
    const sourceFolder = path.join(this.bpModulesPath, interfaceInfo.name)
    const targetFolder = path.join(this.bpModulesPath, `interface_${pascalCase(interfaceInfo.alias)}`)

    if (!existsSync(sourceFolder)) {
      throw new AdkError({
        code: 'GENERATED_FOLDER_MISSING',
        message: `Interface folder not found: ${sourceFolder}`,
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
   * Remove existing interface folder
   */
  private async removeInterfaceFolder(alias: string): Promise<void> {
    const targetFolder = path.join(this.bpModulesPath, `interface_${pascalCase(alias)}`)

    if (existsSync(targetFolder)) {
      await fs.rm(targetFolder, { recursive: true, force: true })
    }
  }

  /**
   * Sync all interfaces
   */
  async syncInterfaces(): Promise<InterfaceSyncResult> {
    const interfaces = await this.parseInterfaces()
    const synced: InterfaceInfo[] = []
    const errors: Array<{ alias: string; error: string }> = []

    if (interfaces.length === 0) {
      return { synced, errors }
    }

    // Ensure bp_modules directory exists
    await fs.mkdir(this.bpModulesPath, { recursive: true })

    for (const interfaceInfo of interfaces) {
      try {
        const isAlreadySynced = await this.isInterfaceSynced(interfaceInfo)

        if (isAlreadySynced) {
          synced.push(interfaceInfo)
          continue
        }

        // Remove existing folder if version mismatch
        await this.removeInterfaceFolder(interfaceInfo.alias)

        // Install the interface
        await this.installInterface(interfaceInfo)

        // Rename to our controlled name
        await this.renameInterfaceFolder(interfaceInfo)

        synced.push(interfaceInfo)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push({ alias: interfaceInfo.alias, error: errorMsg })
      }
    }

    return { synced, errors }
  }
}
