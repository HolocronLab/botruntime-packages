import { AdkError } from '@holocronlab/botruntime-analytics'
import dedent from 'dedent'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { AgentProject } from '../agent-project/index.js'
import {
  fetchServerIntegrationConfigs,
  fetchServerPluginConfigs,
  mergeIntegrationConfig,
} from '../integrations/config-utils.js'
import type { ParsedIntegration } from '../integrations/types.js'
import {
  integrationRequiresAuthorization,
  computeIntegrationStatus,
  isAuthorizationPending,
  authorizationPendingVerdict,
  computePluginCarrierStatus,
  mapPluginDependencyStatuses,
  isCallable,
} from '../dependencies/status.js'
import type { StatusVerdict } from '@holocronlab/botruntime-runtime'

export interface SyncCallbacks {
  onProgress?: (message: string) => void
  onSuccess?: (message: string) => void
  onError?: (message: string) => void
}

import { generateIntegrationTypes } from '../generators/integration-types.js'
import { generatePluginTypes } from '../generators/plugin-types.js'
import { generatePluginActionTypes } from '../generators/plugin-action-types.js'
import { generateInterfaceTypes } from '../generators/interface-types.js'
import { generateTriggerTypes } from '../generators/trigger-types.js'
import { generateConversationTypes } from '../generators/conversation-types.js'
import { generateEventTypes } from '../generators/event-types.js'
import { generateLocalTypes } from '../generators/local-types.js'
import { generateClientWrapper } from '../generators/client-wrapper.js'
import { initAssets as regenerateAssetsArtifacts } from '../generators/assets.js'
import { IntegrationManager } from '../integrations/manager.js'
import { PluginManager } from '../plugins/manager.js'
import { InterfaceManager } from '../interfaces/manager.js'
import { createFile } from '../utils/fs.js'
import { serializeSchema } from '../utils/schema-serialization.js'
import { linkSdk } from '../utils/link-sdk.js'
import { pascalCase } from '../utils/strings.js'
import { DevIdManager } from './dev-id-manager.js'
import { IntegrationSync } from './integration-sync.js'
import { InterfaceSync } from './interface-sync.js'
import { PluginSync } from './plugin-sync.js'
import { formatCode, ADK_VERSION } from '../generators/utils.js'
import { z } from '@holocronlab/botruntime-sdk'
import { getIntegrationAlias, getPluginAlias, bpModuleDirName } from '../utils/ids.js'

const { transforms } = z
import { PluginParser } from '../agent-project/dependencies-parser.js'
import { BUILTIN_INTERFACES } from '../constants.js'
import { BuiltInActions, BuiltInWorkflows, Primitives, Workflow } from '@holocronlab/botruntime-runtime/internal'
import { BUILT_IN_TAGS } from '@holocronlab/botruntime-runtime/definition'

/**
 * Pluggable in-process dependency installer. When provided, the dependency-sync
 * classes call this INSTEAD of spawning a provisioned brt/bp binary to vendor a
 * resource into `<botPath>/bp_modules`. brt supplies one that drives its native
 * `AddCommand` in-process, so the whole agent build path is spawn-free. When
 * omitted (standalone library use), the sync classes fall back to the execa
 * `BpAddCommand`.
 *
 * `resource` is the full ref string: `integration:name@ver` | `plugin:name@ver`
 * | `interface:name@ver`. The installer must actually vendor the resource into
 * `botPath/bp_modules` under its native (kebab-cased) package name — the sync
 * class then renames that folder to its controlled alias, exactly as it does
 * after the execa path.
 */
export type DependencyInstaller = (args: {
  resource: string
  botPath: string
  workspaceId: string
  credentials: { token: string; apiUrl: string }
}) => Promise<void>

export interface BotGeneratorOptions {
  projectPath: string
  outputPath?: string
  adkCommand?: 'adk-dev' | 'adk-build' | 'adk-deploy'
  callbacks?: SyncCallbacks
  installer?: DependencyInstaller
}

function projectLoadOptions(adkCommand: BotGeneratorOptions['adkCommand']): Pick<BotGeneratorOptions, 'adkCommand'> {
  return adkCommand ? { adkCommand } : {}
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

function resolveIntegrationEnabled(integration: ParsedIntegration, cloudEnabled: boolean | undefined): boolean {
  // Explicit snapshot value always wins; then the preserved cloud / dev-console toggle.
  if (integration.enabled !== undefined) return integration.enabled
  if (cloudEnabled !== undefined) return cloudEnabled
  // Otherwise this is a first install with no prior state: an integration starts ENABLED.
  // Codegen still demotes it to inert (`enabled: false`) until it's configured/authorized
  // (computeIntegrationStatus / isAuthorizationPending), so an unconfigured one can't fail the
  // boot — but a ready integration (no required config, or config already supplied) comes up live.
  return true
}

function isBuiltinWorkflow(name: string): boolean {
  return !!Object.values(BuiltInWorkflows).find((x) => x.name === name)
}

function isBuiltinAction(name: string): boolean {
  return !!Object.values(BuiltInActions).find((x) => x.name === name)
}

/**
 * Generate a normalized import path for use in import statements
 * Converts Windows backslashes to forward slashes and removes .ts extension
 */
function getImportPath(from: string, to: string): string {
  return path.relative(path.dirname(from), to).replace(/\.ts$/, '').replace(/\\/g, '/')
}

/**
 * A minimal but valid `IntegrationPackage` / `PluginPackage` literal for a
 * dependency whose module is not synced (MODE B). It is kept only in the
 * definitions map so the static-import bundle stays loadable; it is marked
 * `not_installed` and never registered or called, so placeholder name/version
 * are fine. `PluginPackage` additionally requires `implementation: Buffer`.
 */
function stubPackageLiteral(kind: 'integration' | 'plugin', alias: string): string {
  const id = JSON.stringify(alias)
  const base = `type: "${kind}", name: ${id}, version: "0.0.0", definition: { name: ${id}, version: "0.0.0" }`
  return kind === 'plugin' ? `{ ${base}, implementation: Buffer.alloc(0) }` : `{ ${base} }`
}

export class BotGenerator {
  private projectPath: string
  private outputPath: string
  private adkCommand?: 'adk-dev' | 'adk-build' | 'adk-deploy'
  private callbacks?: SyncCallbacks

  /**
   * Per-alias capability verdicts computed during `generateBotDefinition` (which
   * already resolves `enabled` + merged config), then consumed by
   * `generateIntegrationsDefinition` / `generatePluginsDefinition` to emit the
   * `IntegrationStatuses` / `PluginStatuses` carriers. Keyed by alias. The verdict
   * is the whole carrier — enabledness is derivable (`state === 'available'`), so
   * there is deliberately no parallel `enabled` flag to keep in sync.
   */
  private integrationStatuses: Record<string, StatusVerdict> = {}
  private pluginStatuses: Record<string, StatusVerdict> = {}

  constructor(options: BotGeneratorOptions) {
    this.projectPath = path.resolve(options.projectPath)
    this.outputPath = path.resolve(options.outputPath || path.join(this.projectPath, '.adk'))
    this.adkCommand = options.adkCommand
    this.callbacks = options.callbacks
  }

  private loadProject(): Promise<AgentProject> {
    return AgentProject.load(this.projectPath, projectLoadOptions(this.adkCommand))
  }

  private async listFilesRecursive(rootDir: string): Promise<string[]> {
    try {
      if (!existsSync(rootDir)) return []
      const result: string[] = []
      const walk = async (dir: string, relativeBase: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const abs = path.join(dir, entry.name)
          const rel = path.join(relativeBase, entry.name)
          if (entry.isDirectory()) {
            await walk(abs, rel)
          } else {
            result.push(rel)
          }
        }
      }
      await walk(rootDir, '')
      return result.sort()
    } catch {
      return []
    }
  }

  private async removeEmptyDirectories(rootDir: string): Promise<void> {
    if (!existsSync(rootDir)) return
    const removeIfEmpty = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subdir = path.join(dir, entry.name)
          await removeIfEmpty(subdir)
        }
      }

      // Re-read after potential removals
      const after = await fs.readdir(dir)
      if (after.length === 0 && dir !== rootDir) {
        try {
          await fs.rmdir(dir, { recursive: false })
        } catch {
          // Best-effort cleanup of an empty dir; a leftover folder is harmless.
        }
      }
    }
    await removeIfEmpty(rootDir)
  }

  async generate(): Promise<void> {
    // Load the agent project
    const project = await this.loadProject()

    // Create output directory
    await fs.mkdir(this.outputPath, { recursive: true })

    // Generate bot files. The three bp_modules-gated artifacts (bot.definition.ts,
    // integrations.ts, plugins.ts) are NOT emitted here: their existsSync gating is
    // only meaningful after the `bp add` syncs populate bp_modules, so they are
    // emitted exactly once, post-sync, via emitDependencyArtifacts().
    await this.generateInterfacesDefinition()
    await this.generateIntegrationsTypes()
    await this.generatePluginsTypes()
    await this.generateInterfacesTypes()
    await generateLocalTypes(project)
    await this.generateTriggerTypes()
    await this.generateConversationTypes()
    await this.generateEventTypes()
    await this.generateIntegrationActionTypes()
    await this.generatePluginActionTypes()
    await this.generateRuntimeTypes()
    await this.generateClientWrapper()
    await this.generateBotIndex()
    await this.generatePackageJson(project)
    await this.generateTsConfig()
    await this.generateGlobalTypes()
    await this.copyAssets()
  }

  /**
   * Emit the three `bp_modules`-gated files (`bot.definition.ts`, `integrations.ts`,
   * `plugins.ts`). Must run **after** the `bp add` syncs have populated `bp_modules`:
   * the existsSync gating in these emitters is only accurate post-sync (a clean/CI
   * build starts with an empty `bp_modules`, so a pre-sync emission would classify
   * every dependency `not_installed`). `generateBotProject` validates that every
   * dependency module is actually on disk before calling this, so the MODE B stub path
   * below survives only as a fail-safe for out-of-band deletions.
   */
  async emitDependencyArtifacts(): Promise<void> {
    // Order matters: generateBotDefinition computes the status verdicts, which
    // generateIntegrationsDefinition/generatePluginsDefinition then read to emit
    // the carriers.
    await this.generateBotDefinition()
    await this.generateIntegrationsDefinition()
    await this.generatePluginsDefinition()
  }

  private async generateIntegrationsTypes(): Promise<void> {
    // Load the project to get interfaces
    const project = await this.loadProject()
    const manager = new IntegrationManager({
      project,
    })
    const integrations = await manager.loadIntegrations(project.dependencies || {})

    // List existing files before generation (.adk/integrations)
    const integrationsDir = path.join(this.projectPath, '.adk', 'integrations')
    const existingIntegrationFiles = await this.listFilesRecursive(integrationsDir)

    let aliases = new Set<string>()
    let files = new Set<string>() // tracks all files created in this run (relative to .adk/integrations)

    // Generate imports for each integration
    for (const integration of integrations.integrations) {
      if (integration.definition) {
        const types = await generateIntegrationTypes(integration)

        // Use dynamic import for type
        const importPath = `./${path.join('integrations', types.names.paths.index).replace(/\\/g, '/')}`
        aliases.add(`"${integration.alias}": import("${importPath}").${types.names.typings.index}`)

        for (const [filePath, content] of Object.entries(types.files)) {
          const fullPath = path.join(this.projectPath, '.adk', 'integrations', filePath)

          const dir = path.dirname(fullPath)
          await fs.mkdir(dir, { recursive: true })
          await createFile(fullPath, content)
          files.add(filePath)
        }
      }
    }

    const types = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // ADK Version: ${ADK_VERSION}
      // Generated at: ${new Date().toISOString()}
      ////////////////////////////////////////////////////////

      declare module "@holocronlab/botruntime-runtime/_types/integrations" {
        export type Integrations = {
          ${Array.from(aliases).join(`, `)}
        };
      }
      `

    await createFile(path.join(this.projectPath, '.adk', 'integrations-types.d.ts'), await formatCode(types))

    // Cleanup stale integration files
    const staleIntegrationFiles = existingIntegrationFiles.filter((f) => !files.has(f))
    if (staleIntegrationFiles.length > 0) {
      for (const rel of staleIntegrationFiles) {
        const abs = path.join(integrationsDir, rel)
        try {
          await fs.rm(abs, { force: true })
        } catch {
          // Best-effort stale-file cleanup; a leftover generated file is harmless.
        }
      }
    }
    // remove empty folders after deletion
    await this.removeEmptyDirectories(integrationsDir)
  }

  private async generatePluginsTypes(): Promise<void> {
    const project = await this.loadProject()
    const manager = new PluginManager({
      project,
    })
    const result = await manager.loadPlugins(project.dependencies || {})

    // List existing files before generation (.adk/plugins)
    const pluginsDir = path.join(this.projectPath, '.adk', 'plugins')
    const existingPluginFiles = await this.listFilesRecursive(pluginsDir)

    let aliases = new Set<string>()
    let files = new Set<string>()

    for (const plugin of result.plugins) {
      if (plugin.definition) {
        const types = await generatePluginTypes(plugin)

        const importPath = `./${path.join('plugins', types.names.paths.index).replace(/\\/g, '/')}`
        aliases.add(`"${plugin.alias}": import("${importPath}").${types.names.typings.index}`)

        for (const [filePath, content] of Object.entries(types.files)) {
          const fullPath = path.join(this.projectPath, '.adk', 'plugins', filePath)

          const dir = path.dirname(fullPath)
          await fs.mkdir(dir, { recursive: true })
          await createFile(fullPath, content)
          files.add(filePath)
        }
      }
    }

    const types = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // ADK Version: ${ADK_VERSION}
      // Generated at: ${new Date().toISOString()}
      ////////////////////////////////////////////////////////

      declare module "@holocronlab/botruntime-runtime/_types/plugins" {
        export type Plugins = {
          ${Array.from(aliases).join(`, `)}
        };
      }
      `

    await createFile(path.join(this.projectPath, '.adk', 'plugins-types.d.ts'), await formatCode(types))

    // Cleanup stale plugin files
    const stalePluginFiles = existingPluginFiles.filter((f) => !files.has(f))
    if (stalePluginFiles.length > 0) {
      for (const rel of stalePluginFiles) {
        const abs = path.join(pluginsDir, rel)
        try {
          await fs.rm(abs, { force: true })
        } catch {
          // Best-effort stale-file cleanup; a leftover generated file is harmless.
        }
      }
    }
    await this.removeEmptyDirectories(pluginsDir)
  }

  private async generateTriggerTypes(): Promise<void> {
    const project = await this.loadProject()
    await generateTriggerTypes(project)
  }

  private async generateEventTypes(): Promise<void> {
    const project = await this.loadProject()
    await generateEventTypes(project)
  }

  private async generateConversationTypes(): Promise<void> {
    const project = await this.loadProject()
    await generateConversationTypes(project)
  }

  private async generateIntegrationActionTypes(): Promise<void> {
    const project = await this.loadProject()
    const { generateIntegrationActionTypes } = await import('../generators/integration-action-types.js')
    await generateIntegrationActionTypes(project)
  }

  private async generatePluginActionTypes(): Promise<void> {
    const project = await this.loadProject()
    await generatePluginActionTypes(project)
  }

  private async generateClientWrapper(): Promise<void> {
    const project = await this.loadProject()
    await generateClientWrapper(project)
  }

  private async generateRuntimeTypes(): Promise<void> {
    // Load the project for conditional imports
    const project = await this.loadProject()

    // Load integrations to generate channel types
    const manager = new IntegrationManager({
      project,
    })
    const integrations = await manager.loadIntegrations(project.dependencies || {})

    // Collect all channel names from integrations
    const channels: string[] = []
    for (const integration of integrations.integrations) {
      if (integration.definition) {
        const alias = integration.alias
        for (const channelName of Object.keys(integration.definition.channels || {})) {
          channels.push(`"${alias}.${channelName}"`)
        }
      }
    }

    // Generate channel union type
    const channelsType = channels.length > 0 ? channels.join(' | ') : 'never'

    // Get state types from agent config
    let botStateType = '{}'
    let userStateType = '{}'

    try {
      const configPath = path.join(project.path, 'agent.config.ts')
      // Bust module cache to ensure fresh config on regeneration
      const configModule = await import(`${configPath}?t=${Date.now()}`)
      const config = configModule.default

      if (config?.bot?.state) {
        const botSchema = config.bot.state as z.ZodTypeAny
        if (botSchema.toTypescriptType) {
          botStateType = botSchema.toTypescriptType()
        }
      }

      if (config?.user?.state) {
        const userSchema = config.user.state as z.ZodTypeAny
        if (userSchema.toTypescriptType) {
          userStateType = userSchema.toTypescriptType()
        }
      }
    } catch (error) {
      console.warn('Failed to load agent config for state types:', error)
    }

    const types = `
////////////////////////////////////////////////////////
// DO NOT EDIT THIS FILE DIRECTLY
// This file is auto-generated from the Botpress ADK
// ADK Version: ${ADK_VERSION}
// Generated at: ${new Date().toISOString()}
////////////////////////////////////////////////////////

declare module "@holocronlab/botruntime-runtime/_types/channels" {
  export type Channels = ${channelsType};
  export type ChannelSpec = Channels | readonly Channels[] | '*';
}

declare module "@holocronlab/botruntime-runtime/_types/state" {
  export type BotState = ${botStateType};
  export type UserState = ${userStateType};
}
`

    await createFile(path.join(this.projectPath, '.adk', 'runtime.d.ts'), await formatCode(types))
  }

  private async generateInterfacesTypes(): Promise<void> {
    // Load the project to get interfaces
    const project = await this.loadProject()
    const integrationManager = new IntegrationManager({
      project,
    })
    const manager = new InterfaceManager({
      project,
    })

    // List existing files before generation (.adk/interfaces)
    const interfacesDir = path.join(this.projectPath, '.adk', 'interfaces')
    const existingInterfaceFiles = await this.listFilesRecursive(interfacesDir)

    const interfaces = await manager
      .loadInterfaces(project.dependencies || {})
      .then((result) => result.interfaces.filter((int) => int.definition).map((x) => x.definition!))

    const integrationsWithAlias = await integrationManager
      .loadIntegrations(project.dependencies || {})
      .then((result) =>
        result.integrations.filter((int) => int.definition).map((x) => ({ alias: x.alias, definition: x.definition! }))
      )

    let imports = new Set<string>()
    let aliases = new Set<string>()
    let files = new Set<string>() // tracks all files created in this run (relative to .adk/interfaces)

    // Generate imports for each integration
    for (const int of interfaces) {
      const types = await generateInterfaceTypes(int, integrationsWithAlias)

      imports.add(
        `import { ${types.names.typings.index} } from "./${path.join('interfaces', types.names.paths.index).replace(/\\/g, '/')}";`
      )

      aliases.add(`"${types.names.name}": ${types.names.typings.index}`)

      for (const [filePath, content] of Object.entries(types.files)) {
        const fullPath = path.join(this.projectPath, '.adk', 'interfaces', filePath)

        const dir = path.dirname(fullPath)
        await fs.mkdir(dir, { recursive: true })
        await createFile(fullPath, content)
        files.add(filePath)
      }
    }

    const types = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // File: interfaces.d.ts
      ////////////////////////////////////////////////////////

      ${Array.from(imports).join('\n')}

      declare global {
        export type Interfaces = {
          ${Array.from(aliases).join(`, `)}
        };
      }
      `

    const consts = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // File: interfaces.ts
      ////////////////////////////////////////////////////////

      ${Array.from(imports)
        .map((x) => x.replace('.ts"', '"'))
        .join('\n')}

      export const Interfaces = {
        ${Array.from(aliases).join(',\n')}
      };
      `

    await createFile(path.join(this.projectPath, '.adk', 'interfaces.d.ts'), await formatCode(types))

    await createFile(path.join(this.projectPath, '.adk', 'interfaces.ts'), await formatCode(consts))

    // Cleanup stale interface files
    const staleInterfaceFiles = existingInterfaceFiles.filter((f) => !files.has(f))
    if (staleInterfaceFiles.length > 0) {
      for (const rel of staleInterfaceFiles) {
        const abs = path.join(interfacesDir, rel)
        try {
          await fs.rm(abs, { force: true })
        } catch {
          // Best-effort stale-file cleanup; a leftover generated file is harmless.
        }
      }
    }
    // remove empty folders after deletion
    await this.removeEmptyDirectories(interfacesDir)
  }

  /** Serialize the per-alias carrier verdicts to a JS object literal body. */
  private buildStatusEntries(
    aliases: string[],
    statuses: Record<string, StatusVerdict>,
    moduleExists: (alias: string) => boolean
  ): string {
    return aliases
      .map((alias) => {
        const entry: StatusVerdict = statuses[alias] ?? {
          // Fallback for an alias declared in the dependency snapshot that never got a verdict
          // (e.g. its definition failed to load). Always inert, never fatal.
          ...(moduleExists(alias)
            ? { state: 'unresolved' as const, reason: 'capability status could not be computed at build time' }
            : { state: 'not_installed' as const }),
        }
        return `${JSON.stringify(alias)}: ${JSON.stringify(entry)}`
      })
      .join(',\n ')
  }

  private async generateIntegrationsDefinition(): Promise<void> {
    // Load the project to get integrations
    const project = await this.loadProject()
    const integrations = project.dependencies?.integrations || {}
    const aliases = Object.keys(integrations)

    const moduleExists = (alias: string) =>
      existsSync(path.join(this.outputPath, 'bp_modules', bpModuleDirName('integration', alias)))

    // Generate imports for each integration
    const imports: string[] = []
    const integrationDefs: string[] = []

    for (const alias of aliases) {
      const normalizedAlias = getIntegrationAlias(alias)
      if (moduleExists(alias)) {
        imports.push(`import integration_${normalizedAlias} from "../bp_modules/integration_${normalizedAlias}";`)
        integrationDefs.push(`${JSON.stringify(alias)}: integration_${normalizedAlias}`)
      } else {
        // MODE B: the module is not synced (newly added / offline / version skew).
        // Emit a minimal valid stub instead of a static import so one missing
        // dependency cannot break the whole bundle. It is marked `not_installed`
        // and excluded from the register loop in adk-runtime.ts.
        integrationDefs.push(`${JSON.stringify(alias)}: ${stubPackageLiteral('integration', alias)}`)
      }
    }

    const statusEntries = this.buildStatusEntries(aliases, this.integrationStatuses, moduleExists)

    const content = dedent`
      import { IntegrationPackage } from "@holocronlab/botruntime-sdk";
      import type { StatusVerdict } from "@holocronlab/botruntime-runtime";
      ${imports.length > 0 ? '\n' + imports.join('\n') : ''}

      export const IntegrationDefinitions = {
       ${integrationDefs.join(',\n ')}
      } as Record<string, IntegrationPackage>;

      export const IntegrationStatuses: Record<string, StatusVerdict> = {
       ${statusEntries}
      };
    `

    await createFile(path.join(this.outputPath, 'src', 'integrations.ts'), content)
  }

  private async generatePluginsDefinition(): Promise<void> {
    const project = await this.loadProject()
    const plugins = project.dependencies?.plugins || {}
    const aliases = Object.keys(plugins)

    // Plugin modules sync to bp_modules/plugin_<rawAlias> (the import path uses the
    // raw alias too), unlike integrations which use the normalized alias.
    const moduleExists = (alias: string) =>
      existsSync(path.join(this.outputPath, 'bp_modules', bpModuleDirName('plugin', alias)))

    const imports: string[] = []
    const pluginDefs: string[] = []

    for (const alias of aliases) {
      const normalizedAlias = getPluginAlias(alias)
      if (moduleExists(alias)) {
        imports.push(`import plugin_${normalizedAlias} from "../bp_modules/plugin_${alias}";`)
        pluginDefs.push(`${JSON.stringify(alias)}: plugin_${normalizedAlias}`)
      } else {
        // MODE B: see generateIntegrationsDefinition.
        pluginDefs.push(`${JSON.stringify(alias)}: ${stubPackageLiteral('plugin', alias)}`)
      }
    }

    const statusEntries = this.buildStatusEntries(aliases, this.pluginStatuses, moduleExists)

    const content = dedent`
      import { PluginPackage } from "@holocronlab/botruntime-sdk";
      import type { StatusVerdict } from "@holocronlab/botruntime-runtime";
      ${imports.length > 0 ? '\n' + imports.join('\n') : ''}

      export const PluginDefinitions = {
       ${pluginDefs.join(',\n ')}
      } as Record<string, PluginPackage>;

      export const PluginStatuses: Record<string, StatusVerdict> = {
       ${statusEntries}
      };
    `

    await createFile(path.join(this.outputPath, 'src', 'plugins.ts'), content)
  }

  private async generateInterfacesDefinition(): Promise<void> {
    // Use hard-coded built-in interfaces
    const interfaces = BUILTIN_INTERFACES

    // Generate imports for each interface
    const imports: string[] = []
    const interfaceDefs: string[] = []

    for (const alias of Object.keys(interfaces)) {
      const pascalAlias = pascalCase(alias)
      imports.push(`import interface_${pascalAlias} from "../bp_modules/interface_${pascalAlias}";`)
      interfaceDefs.push(`${pascalAlias}: interface_${pascalAlias}`)
    }

    const content = dedent`
      import { InterfacePackage } from "@holocronlab/botruntime-sdk";

      ${imports.length > 0 ? '\n' + imports.join('\n') : ''}

      export const InterfaceDefinitions = {
       ${interfaceDefs.length > 0 ? interfaceDefs.join(',\n') : ''}
      } as Record<string, InterfacePackage>;
    `

    await createFile(path.join(this.outputPath, 'src', 'interfaces.ts'), await formatCode(content))
  }

  /**
   * Reports errors and merge details when fetching server-side configs.
   *
   * Always warns on fetch errors (network, auth) so the user knows server-only values may be lost.
   * Only logs per-item merge details (preserved/overridden fields) when local config is defined —
   * items without local config use server config as-is, so there's no merge to report.
   */
  private reportServerConfigSync(
    label: string,
    serverConfigResult: { configs: Record<string, Record<string, unknown>>; fetched: boolean; error?: string },
    items: Array<{ alias: string; config?: Record<string, unknown> }>
  ): void {
    if (!this.callbacks) {
      return
    }

    if (serverConfigResult.error) {
      this.callbacks.onError?.(
        `Failed to fetch remote ${label} configs: ${serverConfigResult.error}. Server-only config values may be overwritten.`
      )
      return
    }

    if (!serverConfigResult.fetched) {
      return
    }

    const itemsWithLocalConfig = items.filter((item) => item.config)
    if (itemsWithLocalConfig.length === 0) {
      return
    }

    for (const { alias, config: localConfig } of itemsWithLocalConfig) {
      const serverConfig = serverConfigResult.configs[alias]
      if (!serverConfig || Object.keys(serverConfig).length === 0) {
        continue
      }

      const preserved = Object.keys(serverConfig).filter((key) => !(key in localConfig!))
      if (preserved.length > 0) {
        this.callbacks.onProgress?.(
          `  ${alias}: preserved ${plural(preserved.length, 'remote field')} (${preserved.join(', ')})`
        )
      }

      const overridden = Object.keys(localConfig!).filter(
        (key) => key in serverConfig && localConfig![key] !== serverConfig[key]
      )
      if (overridden.length > 0) {
        this.callbacks.onProgress?.(
          `  ${alias}: local overrides ${plural(overridden.length, 'field')} (${overridden.join(', ')})`
        )
      }
    }
  }

  private async generateBotDefinition(): Promise<void> {
    // Recompute the carrier verdicts from scratch on every generation pass.
    this.integrationStatuses = {}
    this.pluginStatuses = {}

    const project = await this.loadProject()
    const integrations = project.integrations
    // Fetch server-side configs to preserve values (e.g. auth tokens) not in agent.config.ts
    // During deploy/build, fetch from the production bot (botId) to avoid leaking dev config
    const isDeployOrBuild = this.adkCommand === 'adk-deploy' || this.adkCommand === 'adk-build'
    const configTargetBotId = isDeployOrBuild ? project.agentInfo?.botId : undefined
    const serverConfigResult = await fetchServerIntegrationConfigs(project, configTargetBotId)
    this.reportServerConfigSync('integration', serverConfigResult, integrations)

    const imports: string[] = []
    const addIntegrations: string[] = []

    for (const integration of integrations) {
      const { alias, configurationType, config } = integration
      const importName = `integration_${getIntegrationAlias(alias)}`

      const installed = existsSync(path.join(this.outputPath, 'bp_modules', bpModuleDirName('integration', alias)))

      // Authorization gate (WS3 + WS5). A managed-OAuth/connection integration the user
      // enabled but never authorized (e.g. `gmail`: `enabled: true`, no `identifier`) would
      // hard-fail Cloud's `register` hook ("No refresh token found …") and abort the whole
      // `adk dev` / `adk deploy` boot. The fix is to leave it inert (`enabled: false`) — NOT
      // to omit it: `bp` skips registering a disabled integration, but keeps it on the bot so
      // the user can still authorize it (omitting prunes it from the cloud bot — a first-auth
      // dead end) and so any plugin depending on this alias still resolves at `addPlugin`.
      // Keyed off authorization (the `identifier`), not the enable toggle or the registration
      // status: a disabled integration reports `unregistered`, which a status gate would read
      // as blocked forever; the identifier persists across the toggle and lets us re-enable
      // once the user connects it.
      const cloudAuthorized = serverConfigResult.authorizedStates[alias]
      const requiresAuthorization = integration.definition
        ? integrationRequiresAuthorization(integration.definition, configurationType)
        : false
      const authPending = isAuthorizationPending({
        requiresAuthorization,
        ...(cloudAuthorized !== undefined ? { cloudAuthorized } : {}),
        cloudFetchErrored: !!serverConfigResult.error,
      })

      // MODE B: bot.definition.ts is the `bp build` entry — an unconditional static import of
      // a module that was not synced (newly added / offline / version skew) makes `bp build`
      // fail hard and the bot never boots. Only reference modules that exist on disk; the
      // alias otherwise stays inert in the runtime carrier.
      if (installed) {
        imports.push(`import ${importName} from "./bp_modules/${importName}";`)
      }

      // "default" is not a real configuration type - omit it (API will reject it)
      const configType =
        configurationType && configurationType !== 'default' ? `, configurationType: "${configurationType}"` : ''

      const mergedConfig = mergeIntegrationConfig(serverConfigResult.configs[alias], config)
      const configData = Object.keys(mergedConfig).length > 0 ? `, configuration: ${JSON.stringify(mergedConfig)}` : ''

      let enabled: boolean
      if (integration.enabled !== undefined) {
        // Explicit value in agent.config.ts always wins, regardless of cloud state.
        enabled = integration.enabled
      } else if (serverConfigResult.error) {
        // Cloud unreachable: we can't tell "first install" from "user disabled in the
        // dev console", so default to disabled rather than risk re-enabling something
        // the user turned off.
        enabled = false
      } else {
        // Cloud reachable: resolver picks between the cached cloud state (preserves the
        // dev-console toggle) and the first-install default (always enabled). An unconfigured
        // or unauthorized integration is still demoted to inert below, so "start enabled"
        // never risks the boot.
        enabled = resolveIntegrationEnabled(integration, serverConfigResult.enabledStates[alias])
      }

      // Carrier verdict: an installed-but-unauthorized auth-gated integration is inert
      // (`unconfigured`); otherwise the normal capability verdict. `cloudEnabled` here is the
      // enable toggle (distinct from the authorization signal used by the gate above). When
      // it's not installed, the normal verdict yields `not_installed`, which is the more
      // actionable message — so the auth-pending verdict only applies once the module is on disk.
      const cloudEnabled = serverConfigResult.enabledStates[alias]
      const status: StatusVerdict =
        installed && authPending
          ? authorizationPendingVerdict()
          : computeIntegrationStatus({
              installed,
              spec: integration.definition ?? null,
              enabled,
              config: mergedConfig,
              ...(configurationType ? { configurationType } : {}),
              ...(cloudEnabled !== undefined ? { cloudEnabled } : {}),
            })

      // `effectiveEnabled` is derived from the carrier verdict and is the exact value
      // emitted to `addIntegration`, so the definition and the carrier never disagree.
      const effectiveEnabled = isCallable(status.state)
      this.integrationStatuses[alias] = status

      // Surface why a user-enabled integration was left inert, so the boot doesn't look like
      // it silently dropped it. Non-fatal: the agent still boots without the dep.
      // `not_installed` is a failed/absent sync — already reported (and made fatal) by
      // `generateBotProject` — so skip it here.
      if (enabled && !effectiveEnabled && status.state !== 'not_installed') {
        const detail =
          status.state === 'unconfigured' && status.missingFields && status.missingFields.length > 0
            ? `unconfigured — missing ${status.missingFields.join(', ')}`
            : (status.reason ?? status.state)
        this.callbacks?.onProgress?.(
          `  ⚠ ${alias}: left inert (${detail}). It won't be registered — finish setup, then re-run.`
        )
      }

      // Register an on-disk integration with the SDK bot definition. `effectiveEnabled` is
      // false for an inert one (unauthorized / unconfigured / disabled), which keeps Cloud
      // from attempting its `register` hook while leaving the integration declared on the bot
      // (so it isn't pruned and plugins depending on it still resolve). A missing module
      // (not_installed) is skipped (MODE B) and stays inert in the carrier so `bp build` /
      // the deploy stay green.
      if (installed) {
        addIntegrations.push(
          `bot.addIntegration(${importName}, { alias: "${alias}", enabled: ${effectiveEnabled}${configType}${configData} });`
        )
      }
    }

    // Validate plugin dependency references before generating
    const depRefErrors = PluginParser.validateDependencyReferences(project.dependencies || {})
    if (depRefErrors.length > 0) {
      const messages = depRefErrors.map((e) => e.message).join('\n  ')
      throw new AdkError({
        code: 'PLUGIN_DEP_VALIDATION_FAILED',
        message: `Plugin dependency validation failed:\n  ${messages}`,
        expected: true,
        details: { errors: depRefErrors },
      })
    }

    // Parse plugins and generate addPlugin() calls (must come AFTER addIntegration)
    const plugins = project.dependencies?.plugins || {}
    const addPlugins: string[] = []

    const serverPluginConfigResult = await fetchServerPluginConfigs(project, configTargetBotId)
    this.reportServerConfigSync(
      'plugin',
      serverPluginConfigResult,
      Object.entries(plugins).map(([alias, p]) => ({ alias, config: p.config }))
    )

    for (const [alias, pluginConfig] of Object.entries(plugins)) {
      const normalizedAlias = getPluginAlias(alias)
      const importName = `plugin_${normalizedAlias}`

      // MODE B (see the integration loop): only reference an on-disk plugin module.
      // Plugin modules are synced to bp_modules/plugin_<rawAlias> (the import path also
      // uses the raw alias), so check that exact folder name.
      const installed = existsSync(path.join(this.outputPath, 'bp_modules', bpModuleDirName('plugin', alias)))
      if (installed) {
        imports.push(`import ${importName} from "./bp_modules/plugin_${alias}";`)
      }

      const mergedConfig = mergeIntegrationConfig(serverPluginConfigResult.configs[alias], pluginConfig.config)
      const configData = Object.keys(mergedConfig).length > 0 ? `, configuration: ${JSON.stringify(mergedConfig)}` : ''
      const depsData =
        pluginConfig.dependencies && Object.keys(pluginConfig.dependencies).length > 0
          ? `, dependencies: ${JSON.stringify(pluginConfig.dependencies)}`
          : ''

      // Plugin carrier verdict (WS3). The plugin spec is not loaded at build time,
      // so this covers on-disk presence, transitive integration-dependency
      // availability, and Cloud's persisted missing-field verdict. The runtime
      // drift backstop still catches any missing config Cloud has not persisted yet.
      const dependencyStatuses = mapPluginDependencyStatuses(
        pluginConfig.dependencies,
        (integrationAlias) => this.integrationStatuses[integrationAlias]
      )
      this.pluginStatuses[alias] = computePluginCarrierStatus({
        installed,
        dependencyStatuses,
        ...(pluginConfig.missingFields !== undefined ? { persistedMissingFields: pluginConfig.missingFields } : {}),
      })

      // Only register an on-disk plugin with the SDK bot definition (MODE B).
      if (installed) {
        addPlugins.push(`bot.addPlugin(${importName}, { alias: "${alias}"${configData}${depsData} });`)
      }
    }

    // Load user-defined tags from agent.config.ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tag values accessed with dynamic property access
    const botTags: Record<string, any> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tag values accessed with dynamic property access
    const userTags: Record<string, any> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tag values accessed with dynamic property access
    const conversationTags: Record<string, any> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tag values accessed with dynamic property access
    const messageTags: Record<string, any> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tag values accessed with dynamic property access
    const workflowTags: Record<string, any> = {}

    if (project.config?.bot?.tags) {
      Object.assign(botTags, project.config.bot.tags)
    }

    if (project.config?.user?.tags) {
      Object.assign(userTags, project.config.user.tags)
    }

    if (project.config?.conversation?.tags) {
      Object.assign(conversationTags, project.config.conversation.tags)
    }

    if (project.config?.message?.tags) {
      Object.assign(messageTags, project.config.message.tags)
    }

    if (project.config?.workflow?.tags) {
      Object.assign(workflowTags, project.config.workflow.tags)
    }

    // Helper to hash strings - creates short uppercase hashes
    const crypto = require('crypto')
    const hashString = (str: string) => {
      return crypto.createHash('md5').update(str).digest('hex').substring(0, 5).toUpperCase()
    }

    // For each trigger, we need to add possible tags
    for (const trigger of project.triggers) {
      const triggerName = trigger.definition.name

      // Add tag for this trigger - the tag name is based on trigger name
      // The value can be "*" for wildcard or a specific match result
      const tagName = `trigger${hashString(triggerName)}`
      conversationTags[tagName] = {
        title: `Trigger: ${triggerName}`,
        description: `Subscribe to events from trigger "${triggerName}" (use "*" for all events or specific values)`,
      }

      // TODO: Only add workflow tags when workflows exist
      // Currently we don't support workflow definitions yet
      // When implemented, check if project.workflows.length > 0
      // workflowTags[tagName] = {
      //   title: `Trigger: ${triggerName}`,
      //   description: `Subscribe to events from trigger "${triggerName}" (use "*" for all events or specific values)`
      // };
    }

    // Load workflow definitions at build time and generate their schemas
    const workflowDefs: string[] = []
    const recurringWorkflows: Array<{ name: string; schedule: string }> = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow generic requires any for heterogeneous collection
    const workflowInstances: Workflow<any>[] = []

    for (const workflow of project.workflows) {
      try {
        if (isBuiltinWorkflow(workflow.definition.name)) {
          // Built-in workflow - already handled in runtime
          continue
        }

        // User-defined workflow - import from project
        const workflowPath = path.join(project.path, workflow.path)
        // Bust module cache to ensure fresh workflow on regeneration
        const workflowModule = await import(`${workflowPath}?t=${Date.now()}`)
        const workflowInstance = (workflowModule.default || workflowModule[workflow.export]) as Workflow | undefined

        if (workflowInstance) {
          workflowInstances.push(workflowInstance)
        }
      } catch (error) {
        console.error(`Failed to load workflow ${workflow.definition.name}:`, error)
      }
    }

    for (const workflow of Object.values(BuiltInWorkflows)) {
      workflowInstances.push(workflow)
    }

    for (const workflow of workflowInstances) {
      const definition = Primitives.Definitions.getDefinition(workflow)
      if (!Primitives.Definitions.isWorkflowDefinition(definition)) {
        continue
      }

      // Check if workflow has a schedule property for recurring execution
      if (definition.schedule) {
        recurringWorkflows.push({
          name: definition.name,
          schedule: definition.schedule,
        })
      }

      // Generate the workflow definition as inline code
      const inputSchema = definition.input
        ? transforms.fromJSONSchema(definition.input).naked().toTypescriptSchema()
        : 'z.object({})'

      const outputSchema = definition.output
        ? transforms.fromJSONSchema(definition.output).naked().toTypescriptSchema()
        : 'z.object({})'

      const parts = []
      if (definition.description) {
        parts.push(`title: ${JSON.stringify(definition.name)}`)
        parts.push(`description: ${JSON.stringify(definition.description)}`)
      }
      parts.push(`input: { schema: ${inputSchema} }`)
      parts.push(`output: { schema: ${outputSchema} }`)

      // Add workflow tags with built-in tags spread
      parts.push(`tags: {
          ...BUILT_IN_TAGS.workflow,
          key: {
            title: "Workflow Key",
            description: "Unique key for workflow deduplication"
          },
        }`)

      workflowDefs.push(`"${definition.name}": {\n          ${parts.join(',\n          ')}\n        }`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action def values accessed with dynamic property access
    const actionDefs: Record<string, any> = {}
    for (const action of project.actions) {
      const def = action.definition
      // Include ALL actions in bot.definition.ts (even hidden ones)
      actionDefs[def.name] = {
        title: def.title,
        description: def.description,
        attributes: def.attributes,
        input: def.input,
        output: def.output,
        cached: def.cached,
      }
    }

    // Build table definitions for the BotDefinition. Without this block, bp's
    // TablesPublisher sees botDef.tables as undefined and warns about every
    // remote table as "previously defined but not present". ADK also handles
    // table sync via its own TableManager, but we still declare them here so
    // the underlying bp CLI's view stays consistent.
    const tableDefs: string[] = []
    for (const table of project.tables) {
      const def = table.definition
      const parts: string[] = []
      parts.push(`schema: ${transforms.fromJSONSchema(def.schema).toTypescriptSchema()}`)
      if (def.factor !== undefined) parts.push(`factor: ${def.factor}`)
      if (def.keyColumn) parts.push(`keyColumn: ${JSON.stringify(def.keyColumn)}`)
      if (def.tags && Object.keys(def.tags).length > 0) parts.push(`tags: ${JSON.stringify(def.tags)}`)
      if (def.description) parts.push(`description: ${JSON.stringify(def.description)}`)
      tableDefs.push(`"${def.name}": {\n            ${parts.join(',\n            ')}\n          }`)
    }

    const toEventName = (ename: string) => ename.replaceAll(/[^a-zA-Z0-9]/g, '').toLowerCase()

    // Load custom events from agent.config.ts
    const customEventDefs: string[] = []
    const configForEvents = project.config as Record<string, unknown> | undefined
    const customEvents = (configForEvents?.events || {}) as Record<
      string,
      { schema?: z.ZodTypeAny; description?: string }
    >

    for (const [eventName, eventDef] of Object.entries(customEvents)) {
      const schema = eventDef.schema
      let schemaCode = 'z.object({})'

      if (schema && typeof schema.toJSONSchema === 'function') {
        schemaCode = serializeSchema(`Event "${eventName}"`, () =>
          transforms.fromJSONSchema(schema.toJSONSchema()).toTypescriptSchema()
        )
      }

      const parts = [`schema: ${schemaCode}`]
      if (eventDef.description) {
        parts.unshift(`description: ${JSON.stringify(eventDef.description)}`)
      }

      customEventDefs.push(`"${eventName}": {\n            ${parts.join(',\n            ')}\n          }`)
    }

    // Get configuration schema if defined
    const configSchema = project.config?.configuration?.schema
    const configSchemaCode = configSchema
      ? serializeSchema('Agent configuration', () =>
          transforms.fromJSONSchema(configSchema.toJSONSchema()).toTypescriptSchema()
        )
      : undefined

    // Get secrets definitions if defined
    const secretsConfig = project.config?.secrets as
      | Record<string, { optional?: boolean; description?: string }>
      | undefined
    const secretsDef =
      secretsConfig && Object.keys(secretsConfig).length > 0 ? JSON.stringify(secretsConfig) : undefined

    // Check if any conversation has lifecycle management configured
    const hasAnyLifecycle = project.conversations.some((c) => c.definition.hasLifecycle)

    const content = dedent`
      import { BotDefinition, z } from "@holocronlab/botruntime-sdk";
      import {
      BUILT_IN_STATES,
      BUILT_IN_TAGS,
      TranscriptSchema,
      TrackedStateSchema,
      WorkflowCallbackEvent,
      WorkflowScheduleEvent,
      WorkflowContinueEvent,
      SubworkflowFinished,
      WorkflowDataRequestEvent,
      WorkflowNotifyEvent,
      LifecycleNudgeEvent,
      LifecycleExpireEvent,
    } from "@holocronlab/botruntime-runtime/definition";
      ${imports.length > 0 ? '\n' + imports.join('\n') : ''}

      const bot = new BotDefinition({

        attributes: {
          runtime: "adk",
          runtimeVersion: "${ADK_VERSION}",
          ${
            Object.keys(botTags).length > 0
              ? Object.entries(botTags)
                  .map(
                    ([tag, meta]) =>
                      `${meta.description ? `// ${meta.description}\n            ` : ''}"${tag}": ${JSON.stringify(meta.title)}`
                  )
                  .join(',\n            ')
              : ''
          }
        },
        ${configSchemaCode ? `\nconfiguration: {\n  schema: ${configSchemaCode}\n},\n` : ''}
        ${secretsDef ? `\nsecrets: ${secretsDef},\n` : ''}
        user: {
          tags: {
            ...BUILT_IN_TAGS.user,
            ${Object.entries(userTags)
              .filter(([tag]) => !Object.keys(BUILT_IN_TAGS.user).includes(tag))
              .map(
                ([tag, meta]) =>
                  `// ${meta.title}\n            ${meta.description ? `// ${meta.description}\n            ` : ''}"${tag}": ${JSON.stringify(meta)}`
              )
              .join(
                ',\n            '
              )}${Object.entries(userTags).filter(([tag]) => !Object.keys(BUILT_IN_TAGS.user).includes(tag)).length > 0 ? ',' : ''}
          },
        },
        message: {
          tags: {
            ...BUILT_IN_TAGS.message,
            ${Object.entries(messageTags)
              .filter(([tag]) => !Object.keys(BUILT_IN_TAGS.message).includes(tag))
              .map(
                ([tag, meta]) =>
                  `// ${meta.title}\n            ${meta.description ? `// ${meta.description}\n            ` : ''}"${tag}": ${JSON.stringify(meta)}`
              )
              .join(
                ',\n            '
              )}${Object.entries(messageTags).filter(([tag]) => !Object.keys(BUILT_IN_TAGS.message).includes(tag)).length > 0 ? ',' : ''}
          },
        },
        conversation: {
          tags: {
            ...BUILT_IN_TAGS.conversation,
            ${Object.entries(conversationTags)
              .filter(([tag]) => !Object.keys(BUILT_IN_TAGS.conversation).includes(tag))
              .map(
                ([tag, meta]) =>
                  `// ${meta.title}\n            ${meta.description ? `// ${meta.description}\n            ` : ''}"${tag}": ${JSON.stringify(meta)}`
              )
              .join(
                ',\n            '
              )}${Object.entries(conversationTags).filter(([tag]) => !Object.keys(BUILT_IN_TAGS.conversation).includes(tag)).length > 0 ? ',' : ''}
          },
        },
        ${
          workflowDefs.length > 0
            ? `workflows: {
          ${workflowDefs.join(',\n          ')}
        },`
            : ''
        }
        ${
          Object.keys(actionDefs).length > 0
            ? `actions: {
          ${Object.entries(actionDefs)
            .map(([name, def]) => {
              const parts = []
              if (def.title) parts.push(`title: ${JSON.stringify(def.title)}`)
              if (def.description) parts.push(`description: ${JSON.stringify(def.description)}`)
              if (def.attributes) parts.push(`attributes: ${JSON.stringify(def.attributes)}`)
              parts.push(`input: { schema: ${transforms.fromJSONSchema(def.input).toTypescriptSchema()} }`)
              parts.push(`output: { schema: ${transforms.fromJSONSchema(def.output).toTypescriptSchema()} }`)
              return `"${name}": {\n            ${parts.join(',\n            ')}\n          }`
            })
            .join(',\n          ')}
        },`
            : ''
        }
        ${
          tableDefs.length > 0
            ? `tables: {
          ${tableDefs.join(',\n          ')}
        },`
            : ''
        }
        ${
          recurringWorkflows.length > 0
            ? `recurringEvents: {
          ${recurringWorkflows
            .map(
              (wf) => `"${toEventName(wf.name + 'Schedule')}": {
            type: WorkflowScheduleEvent.name,
            schedule: { cron: "${wf.schedule}" },
            payload: { workflow: "${wf.name}" },
          }`
            )
            .join(',\n          ')}
        },`
            : ''
        }

        events: {
          [WorkflowScheduleEvent.name]: {
            schema: WorkflowScheduleEvent.schema,
          },
          [WorkflowCallbackEvent.name]: {
            schema: WorkflowCallbackEvent.schema,
          },
          [WorkflowContinueEvent.name]: {
            schema: WorkflowContinueEvent.schema,
          },
          [SubworkflowFinished.name]: {
            schema: SubworkflowFinished.schema,
          },
          [WorkflowDataRequestEvent.name]: {
            schema: WorkflowDataRequestEvent.schema,
          },
          [WorkflowNotifyEvent.name]: {
            schema: WorkflowNotifyEvent.schema,
          },
          ${
            hasAnyLifecycle
              ? `[LifecycleNudgeEvent.name]: {
            schema: LifecycleNudgeEvent.schema,
          },
          [LifecycleExpireEvent.name]: {
            schema: LifecycleExpireEvent.schema,
          },`
              : ''
          }
          ${customEventDefs.length > 0 ? customEventDefs.join(',\n          ') + ',' : ''}
        },

        states: {
          /**
           * This is the ADK-native conversation state that contains the
           * necessary data to run the conversation and its handlers.
          */
          conversation: {
            type: "conversation",
            schema: z.object({ transcript: TranscriptSchema }),
          },

          /**
           * This is a generic state to store the conversation-specific state.
           * This is defined by the users at build-time when they define conversations.
           * Because each conversation can have its own state schema, we use \`z.any()\`
          */
          [BUILT_IN_STATES.conversation]: {
            type: "conversation",
            schema: TrackedStateSchema,
          },

          /**
           * Bot-wide global state that persists across all conversations
           */
          [BUILT_IN_STATES.bot]: {
            type: "bot",
            schema: TrackedStateSchema,
          },

          /**
           * User-specific state that persists across conversations for each user
           */
          [BUILT_IN_STATES.user]: {
            type: "user",
            schema: TrackedStateSchema,
          },

          /**
           * Workflow-specific state that persists across workflow executions
           */
          [BUILT_IN_STATES.workflowState]: {
            type: "workflow",
            schema: TrackedStateSchema,
          },

          /**
           * Workflow cached steps executions
           */
          [BUILT_IN_STATES.workflowSteps]: {
            type: "workflow",
            schema: TrackedStateSchema,
          },

          /**
           * Data source metadata for dashboard visibility (knowledge base sources)
           */
          [BUILT_IN_STATES.dsData]: {
            type: "bot",
            schema: z.record(z.any()),
          },
          ${
            hasAnyLifecycle
              ? `/**
           * Lifecycle session state for nudge/expiration tracking.
           * Survives user state resets — stored in separate namespace.
           */
          [BUILT_IN_STATES.lifecycle]: {
            type: "conversation",
            schema: TrackedStateSchema,
          },`
              : ''
          }
        },
      });
    `

    // This is done so dedent doesn't unescape newlines in multiline integration config inputs
    const integrationsSection = addIntegrations.length > 0 ? '\n' + addIntegrations.join('\n') : ''
    const pluginsSection = addPlugins.length > 0 ? '\n' + addPlugins.join('\n') : ''
    const fullContent = content + integrationsSection + pluginsSection + '\n\nexport default bot;'

    await createFile(path.join(this.outputPath, 'bot.definition.ts'), await formatCode(fullContent))
  }

  private async generateBotIndex(): Promise<void> {
    const content = dedent`
      import * as bp from '.botpress'
      import { BotLogger } from '@holocronlab/botruntime-sdk'
      import { setupAdkRuntime } from './adk-runtime'
      import {isMainThread, isWorkerMode, initializeParentWorker, runWorker} from '@holocronlab/botruntime-runtime/internal'
      import { handlers } from "@holocronlab/botruntime-runtime/runtime";

      // SDK/public bot types do not exactly match ADK's internal runtime setup types.
      const logger = new BotLogger({})
      const bot = new bp.Bot({
        actions: {} as any,
        register: async (props: Parameters<typeof handlers.trigger.triggerRegisterEvent>[0]) => {
          handlers.trigger.triggerRegisterEvent(props)
        }
      })


      // ============================================================================
      // WORKER INITIALIZATION
      // ============================================================================

      if (isWorkerMode() && isMainThread) {
        // Branch 1: Main thread in worker mode - initialize parent with pool
        if (process.env.BP_DEBUG) logger.debug("[Main] Initializing parent worker with pool...");
        initializeParentWorker(bot as unknown as Record<string, unknown>);
      } else if (isWorkerMode() && process.env.IS_DEV_WORKER === "true") {
        // Branch 2: Worker thread - run child worker
        if (process.env.BP_DEBUG) logger.debug("[Worker] Initializing child worker...");
        const markWorkerReady = runWorker(bot as any);
        setupAdkRuntime(bot);
        markWorkerReady();
      } else {
        // Branch 3: Worker mode disabled - single-thread mode
        if (process.env.BP_DEBUG) logger.debug("[Bot] Running in single-thread mode");
        setupAdkRuntime(bot);
      }

      export default bot
    `

    await createFile(path.join(this.outputPath, 'src', 'index.ts'), await formatCode(content))
  }

  private async generatePackageJson(project: AgentProject): Promise<void> {
    const packageJson = {
      name: `@bp-templates/${project.config?.name || 'agent'}-bot`,
      scripts: {
        'check:type': 'tsc --noEmit',
      },
      private: true,
      devDependencies: {
        typescript: '^5.9.3',
      },
    }

    await createFile(path.join(this.outputPath, 'package.json'), JSON.stringify(packageJson, null, 2))
  }

  private async generateTsConfig(): Promise<void> {
    const tsConfig = {
      compilerOptions: {
        lib: ['es2022'],
        module: 'es2022',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        moduleResolution: 'bundler',
        allowUnusedLabels: false,
        allowUnreachableCode: false,
        noFallthroughCasesInSwitch: true,
        noImplicitOverride: true,
        noImplicitReturns: true,
        noUncheckedIndexedAccess: true,
        noUnusedParameters: true,
        target: 'es2017',
        baseUrl: '.',
        outDir: 'dist',
        checkJs: false,
        incremental: true,
        exactOptionalPropertyTypes: false,
        resolveJsonModule: true,
        noPropertyAccessFromIndexSignature: false,
        noUnusedLocals: false,
        jsx: 'react',
        noEmit: true,
      },
      include: ['.botpress/**/*', 'src/**/*', 'bp_modules/**/*', './*.ts', './*.json', '../*.d.ts'],
    }

    await createFile(path.join(this.outputPath, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2))
  }

  private async generateGlobalTypes(): Promise<void> {
    const content = dedent`
      // Global types for ADK assets
      declare global {
        const assets: {
          get(path: string): Promise<{
            url: string;
            path: string;
            name: string;
            size: number;
            mime: string;
            hash: string;
            createdAt: string;
            updatedAt: string;
            fileId: string;
          }>;
        };
      }

      export {};
    `

    await createFile(path.join(this.outputPath, 'global.d.ts'), await formatCode(content))
  }

  private async copyAssets(): Promise<void> {
    const assetsPath = path.join(this.projectPath, 'assets')
    const targetPath = path.join(this.outputPath, 'assets')

    if (existsSync(assetsPath)) {
      await fs.mkdir(targetPath, { recursive: true })
      // Copy assets recursively
      await this.copyDirectory(assetsPath, targetPath)
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true })

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true })
        await this.copyDirectory(srcPath, destPath)
      } else {
        await fs.copyFile(srcPath, destPath)
      }
    }
  }

  async generateAdkRuntime(): Promise<void> {
    const project = new AgentProject(this.projectPath)
    await project.reload()

    const srcDir = path.join(this.outputPath, 'src')

    /* <conversations.ts> */ {
      const dest = path.join(srcDir, 'conversations.ts')
      const imports = new Map<
        string,
        {
          statement: string
          name: string
        }
      >()
      const exports = new Set<string>()
      let index = 1

      for (const conversation of project.conversations) {
        if (!imports.has(conversation.path)) {
          const name = `conversations_${index++}`
          const importPath = getImportPath(dest, path.join(project.path, conversation.path))

          imports.set(conversation.path, {
            name,
            statement: `import * as ${name} from "${importPath}";`,
          })
        }

        exports.add(
          `"${conversation.definition.channel}": ${imports.get(conversation.path)!.name}.${conversation.export}`
        )
      }

      const content = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // File: conversations.ts
      ////////////////////////////////////////////////////////

      ${Array.from(imports)
        .map(([, { statement }]) => `${statement}`)
        .join('\n')}

      export const Conversations = {
        ${Array.from(exports).join(',\n')}
      };
      `

      await createFile(dest, await formatCode(content))
    } /* </conversations.ts> */

    /* <knowledge.ts> */ {
      const dest = path.join(srcDir, 'knowledge.ts')
      const imports = new Map<
        string,
        {
          statement: string
          name: string
        }
      >()
      const exports = new Set<string>()
      let index = 1

      for (const knowledge of project.knowledge) {
        if (!imports.has(knowledge.path)) {
          const name = `knowledge_${index++}`
          const importPath = getImportPath(dest, path.join(project.path, knowledge.path))

          imports.set(knowledge.path, {
            name,
            statement: `import * as ${name} from "${importPath}";`,
          })
        }

        exports.add(`"${knowledge.definition.name}": ${imports.get(knowledge.path)!.name}.${knowledge.export}`)
      }

      const content = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // File: knowledge.ts
      ////////////////////////////////////////////////////////

      ${Array.from(imports)
        .map(([, { statement }]) => `${statement}`)
        .join('\n')}

      export const Knowledge = {
        ${Array.from(exports).join(',\n')}
      };
      `

      await createFile(dest, await formatCode(content))
    } /* </knowledge.ts> */

    /* <custom-components.ts> */ {
      const dest = path.join(srcDir, 'custom-components.ts')
      const imports = new Map<
        string,
        {
          statement: string
          name: string
        }
      >()
      const exports = new Set<string>()
      let index = 1

      for (const comp of project.customComponents) {
        if (!imports.has(comp.path)) {
          const name = `components_${index++}`
          const importPath = getImportPath(dest, path.join(project.path, comp.path))

          imports.set(comp.path, {
            name,
            statement: `import * as ${name} from "${importPath}";`,
          })
        }

        exports.add(`"${comp.definition.name}": ${imports.get(comp.path)!.name}.${comp.export}`)
      }

      const content = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // File: custom-components.ts
      ////////////////////////////////////////////////////////

      ${Array.from(imports)
        .map(([, { statement }]) => `${statement}`)
        .join('\n')}

      export const CustomComponents = {
        ${Array.from(exports).join(',\n')}
      };
      `

      await createFile(dest, await formatCode(content))
    } /* </custom-components.ts> */

    /* <triggers.ts> */ {
      const dest = path.join(srcDir, 'triggers.ts')
      const {
        z: { transforms },
      } = await import('@holocronlab/botruntime-sdk')
      const imports = new Map<
        string,
        {
          statement: string
          name: string
        }
      >()
      const exports = new Set<string>()
      const payloadTypes: Record<string, string> = {}
      let index = 1

      // First pass: collect imports and exports
      for (const trigger of project.triggers) {
        if (!imports.has(trigger.path)) {
          const name = `triggers_${index++}`
          const importPath = getImportPath(dest, path.join(project.path, trigger.path))

          imports.set(trigger.path, {
            name,
            statement: `import * as ${name} from "${importPath}";`,
          })
        }

        exports.add(`"${trigger.definition.name}": ${imports.get(trigger.path)!.name}.${trigger.export}`)
      }

      // Second pass: extract payload schemas and compile to TypeScript types
      for (const trigger of project.triggers) {
        try {
          // Import the trigger module to get the actual instance
          const absolutePath = path.join(project.path, trigger.path)
          // Bust module cache to ensure fresh trigger on regeneration
          const triggerModule = await import(`${absolutePath}?t=${Date.now()}`)
          const triggerInstance = triggerModule[trigger.export] || triggerModule.default

          if (triggerInstance && triggerInstance.payload) {
            // Convert Zod schema to JSON Schema, then to TypeScript type
            const jsonSchema = transforms.toJSONSchema(triggerInstance.payload)
            const payloadType = transforms.fromJSONSchema(jsonSchema).toTypescriptType()
            payloadTypes[trigger.definition.name] = payloadType
          } else {
            payloadTypes[trigger.definition.name] = '{}'
          }
        } catch (error) {
          console.warn(`Warning: Could not process trigger ${trigger.definition.name}:`, error)
          payloadTypes[trigger.definition.name] = '{}'
        }
      }

      const content = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // File: triggers.ts
      ////////////////////////////////////////////////////////

      ${Array.from(imports)
        .map(([, { statement }]) => `${statement}`)
        .join('\n')}

      export const Triggers = {
        ${Array.from(exports).join(',\n')}
      };

      // Extract trigger payload types with compiled TypeScript types
      type _TriggerPayloads = {
        ${Object.entries(payloadTypes)
          .map(([name, type]) => `"${name}": ${type}`)
          .join(';\n        ')}
      };

      declare global {
        export type TriggerPayloads = _TriggerPayloads;
      }
      `

      await createFile(dest, await formatCode(content))
    } /* </triggers.ts> */

    /* <workflows.ts> */ {
      const dest = path.join(srcDir, 'workflows.ts')
      const imports = new Map<
        string,
        {
          statement: string
          name: string
        }
      >()
      const exports = new Set<string>()
      let index = 1

      for (const workflow of project.workflows) {
        if (isBuiltinWorkflow(workflow.definition.name)) {
          // Built-in workflow - already handled in runtime
          continue
        }

        if (!imports.has(workflow.path)) {
          // User-defined workflow - import from project
          const name = `workflows_${index++}`
          const importPath = getImportPath(dest, path.join(project.path, workflow.path))

          const statement = `import * as ${name} from "${importPath}";`
          imports.set(workflow.path, {
            name,
            statement,
          })
        }
      }

      // Generate exports
      for (const workflow of project.workflows) {
        if (isBuiltinWorkflow(workflow.definition.name)) {
          // Built-in workflow - already handled in runtime
          continue
        }

        const importEntry = imports.get(workflow.path)!
        const exportStatement = workflow.export.replace('].', ']!.')

        exports.add(`"${workflow.definition.name}": ${importEntry.name}.${exportStatement}`)
      }

      const content = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // File: workflows.ts
      ////////////////////////////////////////////////////////

      ${Array.from(imports)
        .map(([, { statement }]) => `${statement}`)
        .join('\n')}

      export const Workflows = {
        ${Array.from(exports).join(',\n')}
      };
      `

      await createFile(dest, await formatCode(content))
    } /* </workflows.ts> */

    /* <actions.ts> */ {
      const dest = path.join(srcDir, 'actions.ts')
      const imports = new Map<
        string,
        {
          statement: string
          name: string
        }
      >()
      const exports = new Set<string>()
      let index = 1

      for (const action of project.actions) {
        if (isBuiltinAction(action.definition.name)) {
          // Built-in action - already handled in runtime
          continue
        }

        if (!imports.has(action.path)) {
          const name = `actions_${index++}`
          const importPath = getImportPath(dest, path.join(project.path, action.path))

          imports.set(action.path, {
            name,
            statement: `import * as ${name} from "${importPath}";`,
          })
        }

        exports.add(`"${action.definition.name}": ${imports.get(action.path)!.name}.${action.export}`)
      }

      const content = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // File: actions.ts
      ////////////////////////////////////////////////////////

      ${Array.from(imports)
        .map(([, { statement }]) => `${statement}`)
        .join('\n')}

      export const Actions = {
        ${Array.from(exports).join(',\n')}
      };
      `

      await createFile(dest, await formatCode(content))
    } /* </actions.ts> */

    /* <tables.ts> */ {
      const dest = path.join(srcDir, 'tables.ts')
      const imports = new Map<
        string,
        {
          statement: string
          name: string
        }
      >()
      const exports = new Set<string>()
      let index = 1

      for (const table of project.tables) {
        if (!imports.has(table.path)) {
          const name = `tables_${index++}`
          const importPath = getImportPath(dest, path.join(project.path, table.path))

          imports.set(table.path, {
            name,
            statement: `import * as ${name} from "${importPath}";`,
          })
        }

        exports.add(`"${table.definition.name}": ${imports.get(table.path)!.name}.${table.export}`)
      }

      const content = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // File: tables.ts
      ////////////////////////////////////////////////////////

      ${Array.from(imports)
        .map(([, { statement }]) => `${statement}`)
        .join('\n')}

      export const Tables = {
        ${Array.from(exports).join(',\n')}
      };
      `

      await createFile(dest, await formatCode(content))
    } /* </tables.ts> */

    /* <config.ts> */ {
      const dest = path.join(srcDir, 'config.ts')
      const importPath = getImportPath(dest, path.join(project.path, 'agent.config.ts'))

      const content = `
      ////////////////////////////////////////////////////////
      // DO NOT EDIT THIS FILE DIRECTLY
      // This file is auto-generated from the Botpress ADK
      // File: config.ts
      ////////////////////////////////////////////////////////

      import AgentConfigImport from "${importPath}";

      export const AgentConfig = AgentConfigImport;
      `

      await createFile(dest, await formatCode(content))
    } /* </config.ts> */

    const content = dedent`
      import * as bp from ".botpress";
      import { IntegrationDefinitions, IntegrationStatuses } from "./integrations";
      import { PluginDefinitions, PluginStatuses } from "./plugins";
      import { InterfaceDefinitions } from "./interfaces";
      import { initializeAssets } from "./assets-runtime";
      import { handlers, patchHandlers, agentRegistry, z, initialize, register, registerIntegration } from "@holocronlab/botruntime-runtime/runtime";
      import { AgentConfig } from "./config";
      import { Conversations } from "./conversations";
      import { Knowledge } from "./knowledge";
      import { Triggers } from "./triggers";
      import { Workflows } from "./workflows";
      import { Actions } from "./actions";
      import { Tables } from "./tables";
      import { CustomComponents } from "./custom-components";
      import { Interfaces } from "../../interfaces";
      ${await this.generateComponentUrlsBlock()}

      const NOT_INSTALLED = { state: "not_installed" as const };

      function buildIntegrationRegistry(definitions: typeof IntegrationDefinitions, statuses: typeof IntegrationStatuses) {
        const registry = Object.entries(definitions).map(([alias, def]) => ({
          ...def,
          alias,
          status: statuses[alias] ?? NOT_INSTALLED,
        }));

        for (const integration of registry) {
          if (integration.status.state === "not_installed") continue;
          try {
            registerIntegration({ alias: integration.alias, definition: integration.definition });
          } catch (err) {
            integration.status = { state: "errored", reason: err instanceof Error ? err.message : String(err) };
          }
        }

        return registry;
      }

      function buildPluginRegistry(definitions: typeof PluginDefinitions, statuses: typeof PluginStatuses) {
        return Object.entries(definitions).map(([alias, def]) => ({
          ...def,
          alias,
          status: statuses[alias] ?? NOT_INSTALLED,
        }));
      }

      export function setupAdkRuntime(bot: bp.Bot) {
        // Initialize global error handlers for the runtime
        // Keep the SDK-to-ADK-internal type bridge contained to this generated bootstrap file.
        const runtimeBot = bot as any;

        initialize({ config: AgentConfig })

        register(...Object.values(Conversations));
        register(...Object.values(Workflows));
        register(...Object.values(Triggers));
        register(...Object.values(Actions));
        register(...Object.values(Tables));
        register(...Object.values(Knowledge));
        register(...Object.values(CustomComponents));

        // Set deployed URLs on custom components
        for (const [name, component] of Object.entries(CustomComponents)) {
          const url = componentUrls[name as keyof typeof componentUrls];
          if (url && typeof (component as any)._setUrl === 'function') {
            (component as any)._setUrl(url);
          }
        }

        // Status-bearing carriers (WS2/WS3). Each entry carries its build-time
        // capability verdict so the runtime proxies can gate calls: only \`available\`
        // dependencies are callable, everything else is inert and throws a typed,
        // catchable error instead of crashing the bot. \`buildIntegrationRegistry\`
        // also registers the installed integrations and isolates registration faults
        // (MODE B stubs are skipped; a failing register demotes that entry to \`errored\`).
        const integrationRegistry = buildIntegrationRegistry(IntegrationDefinitions, IntegrationStatuses);
        const pluginRegistry = buildPluginRegistry(PluginDefinitions, PluginStatuses);

        // Initialize the global agent registry
        agentRegistry.initialize({
          integrations: integrationRegistry,
          interfaces: Object.entries(InterfaceDefinitions).map(([alias, def]) => ({ ...def, alias })),
          interfacesMapping: Interfaces as Record<string, any>,
          plugins: pluginRegistry,
        });

        // Patch bot handlers to add runtime context
        patchHandlers(runtimeBot);

        // Initialize assets system
        initializeAssets();

        // Setup conversation, trigger, and workflow handlers
        handlers.conversation.setup(runtimeBot);
        handlers.event.setup(runtimeBot);
        handlers.trigger.setup(runtimeBot);
        handlers.workflow.setup(runtimeBot);
        handlers.actions.setup(runtimeBot);
        handlers.plugins.setup(runtimeBot);
      }
    `

    await createFile(path.join(this.outputPath, 'src', 'adk-runtime.ts'), await formatCode(content))
  }

  private async generateComponentUrlsBlock(): Promise<string> {
    const manifestPath = path.join(this.projectPath, '.adk', 'components.manifest.json')
    try {
      if (!existsSync(manifestPath)) {
        return 'const componentUrls: Record<string, string> = {};'
      }
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))
      const entries = Object.entries(manifest)
        .map(([name, data]) => `"${name}": "${(data as { url: string }).url}"`)
        .join(',\n  ')
      return `const componentUrls: Record<string, string> = {\n  ${entries}\n};`
    } catch {
      return 'const componentUrls: Record<string, string> = {};'
    }
  }

  async copyAssetsRuntime(): Promise<void> {
    const assetsRuntimePath = path.join(this.projectPath, '.adk', 'assets-runtime.ts')

    // For anything that isn't an explicit `adk dev` invocation, regenerate the runtime
    // artifact with dev:false. This keeps shipped agents free of the dev-only URL refresher
    // (and its `client` import), overwrites any stale dev-mode file left over from a prior
    // `adk dev` if the assets directory was removed in between, and also handles callers
    // that don't pass `adkCommand` (defensive default to prod-safe). We delegate to the
    // `initAssets` generator because it handles both the with-assets (populated runtime)
    // and without-assets (empty stub) branches.
    const isShippingBuild = this.adkCommand !== 'adk-dev'
    if (isShippingBuild) {
      const project = await this.loadProject()
      await regenerateAssetsArtifacts(this.projectPath, project.agentInfo?.botId, { dev: false })
    }

    if (existsSync(assetsRuntimePath)) {
      const content = await fs.readFile(assetsRuntimePath, 'utf-8')
      await createFile(path.join(this.outputPath, 'src', 'assets-runtime.ts'), await formatCode(content))
    }
  }
}

export async function generateBotProject(options: BotGeneratorOptions): Promise<void> {
  const generator = new BotGenerator(options)
  const botPath = options.outputPath || path.join(options.projectPath, '.adk', 'bot')

  // generate() must run first: it creates botPath and the bot source files.
  await generator.generate()

  // These four steps are mutually independent and write to distinct locations
  // (ADK runtime files, copied assets, the @holocronlab/botruntime-sdk node_modules symlink,
  // and the devId project cache) — none of them touch bp_modules — so run them
  // concurrently rather than serially.
  const devIdManager = new DevIdManager(options.projectPath, botPath)
  await Promise.all([
    generator.generateAdkRuntime(),
    generator.copyAssetsRuntime(),
    linkSdk(options.projectPath, botPath),
    devIdManager.restoreDevId(),
  ])

  // The syncs below vendor dependencies into the same botPath (bp_modules and
  // the root package.json), so they stay sequential to avoid racing on shared
  // files. When `options.installer` is set they vendor IN-PROCESS (no child
  // process); otherwise they fall back to the execa `bp add` path.
  const syncOptions = { ...projectLoadOptions(options.adkCommand), installer: options.installer }

  // Sync integrations
  const integrationSync = new IntegrationSync(options.projectPath, botPath, syncOptions)
  const integrationSyncResult = await integrationSync.syncIntegrations()

  if (integrationSyncResult.errors.length > 0) {
    console.warn(`⚠️  Some integrations failed to sync:`)
    integrationSyncResult.errors.forEach(({ alias, error }) => {
      console.warn(`  - ${alias}: ${error}`)
    })
  }

  // Sync interfaces
  const interfaceSync = new InterfaceSync(options.projectPath, botPath, { installer: options.installer })
  const interfaceSyncResult = await interfaceSync.syncInterfaces()

  if (interfaceSyncResult.errors.length > 0) {
    console.warn(`⚠️  Some interfaces failed to sync:`)
    interfaceSyncResult.errors.forEach(({ alias, error }) => {
      console.warn(`  - ${alias}: ${error}`)
    })
  }

  // Sync plugins
  const pluginSync = new PluginSync(options.projectPath, botPath, syncOptions)
  const pluginSyncResult = await pluginSync.syncPlugins()

  if (pluginSyncResult.errors.length > 0) {
    console.warn(`⚠️  Some plugins failed to sync:`)
    pluginSyncResult.errors.forEach(({ alias, error }) => {
      console.warn(`  - ${alias}: ${error}`)
    })
  }

  // The definition emission below references every snapshot dependency's module
  // statically, so a module still missing after its sync is a hard, actionable
  // failure — NOT something to paper over. Omitting the dependency instead would
  // deploy a definition without it, and bp's update prunes anything absent from
  // the definition (losing its cloud config / OAuth connection); emitting a
  // plugin whose backing integration was omitted aborts the whole boot inside
  // the SDK's addPlugin. Failing here, with the sync error attached, is the only
  // non-destructive outcome.
  const project = await AgentProject.load(options.projectPath, projectLoadOptions(options.adkCommand))
  const syncErrorByAlias = new Map<string, string>()
  for (const { alias, error } of [...integrationSyncResult.errors, ...pluginSyncResult.errors]) {
    syncErrorByAlias.set(alias, error)
  }
  const missingModules: Array<{ kind: 'integration' | 'plugin'; alias: string; cause?: string }> = []
  for (const alias of Object.keys(project.dependencies?.integrations ?? {})) {
    if (!existsSync(path.join(botPath, 'bp_modules', bpModuleDirName('integration', alias)))) {
      // Sync errors are keyed by the normalized alias (IntegrationInfo.alias).
      missingModules.push({ kind: 'integration', alias, cause: syncErrorByAlias.get(getIntegrationAlias(alias)) })
    }
  }
  for (const alias of Object.keys(project.dependencies?.plugins ?? {})) {
    if (!existsSync(path.join(botPath, 'bp_modules', bpModuleDirName('plugin', alias)))) {
      missingModules.push({ kind: 'plugin', alias, cause: syncErrorByAlias.get(alias) })
    }
  }
  if (missingModules.length > 0) {
    const lines = missingModules.map((m) => `  - ${m.kind} '${m.alias}'${m.cause ? `: ${m.cause}` : ''}`).join('\n')
    throw new AdkError({
      code: 'DEPENDENCY_MODULES_MISSING',
      message: `${missingModules.length} dependency ${missingModules.length === 1 ? 'module is' : 'modules are'} missing from bp_modules after sync:\n${lines}`,
      expected: true,
      details: { missing: missingModules },
      suggestion:
        'Check connectivity and credentials, then retry the build (the sync reinstalls missing modules). Building without them would ship a definition that prunes their cloud config.',
    })
  }

  // Emit the bp_modules-gated files exactly once, now that the syncs have populated
  // bp_modules and the validation above guaranteed every dependency module is on disk.
  await generator.emitDependencyArtifacts()
}
