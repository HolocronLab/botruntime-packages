import { Dependencies, ValidationError } from '../agent-project/types.js'
import { PluginDefinition, PluginRef, ParsedPlugin } from './types.js'
import { PluginParser } from '../agent-project/dependencies-parser.js'
import { ValidationErrors } from '../agent-project/validation-errors.js'
import { CatalogClientFactory, type CatalogClientOptions } from '../dependencies/catalog/client-factory.js'
import { CatalogService } from '../dependencies/catalog/catalog-service.js'
import { PluginCatalogSource, type PluginSearchResult } from '../dependencies/catalog/plugin-source.js'

export type { PluginSearchResult }

export interface PluginManagerOptions extends CatalogClientOptions {
  noCache?: boolean
}

/**
 * Loads, validates and searches plugins.
 *
 * Since WS4 this is a thin shim over the unified {@link CatalogService} /
 * {@link PluginCatalogSource} (public Botpress Hub only). It keeps the
 * parse-and-validate orchestration (`loadPlugins`) and the stable public surface.
 */
export class PluginManager {
  private readonly source: PluginCatalogSource
  private readonly service: CatalogService<PluginDefinition, PluginRef>

  constructor(options: PluginManagerOptions = {}) {
    const { noCache, ...clientOptions } = options
    const clientFactory = new CatalogClientFactory(clientOptions)
    this.source = new PluginCatalogSource(clientFactory)
    this.service = new CatalogService(
      this.source,
      noCache || !clientFactory.hasCacheAuthority,
      clientFactory.cacheAuthority,
      () => clientFactory.validateAuthority(),
      !clientFactory.hasCacheAuthority
    )
  }

  /**
   * Load and validate all plugins from dependencies
   */
  async loadPlugins(dependencies: Dependencies): Promise<{
    plugins: ParsedPlugin[]
    errors: ValidationError[]
    warnings: ValidationError[]
  }> {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Parse plugins from dependencies
    const parseResult = PluginParser.parsePlugins(dependencies)
    const plugins = parseResult.plugins
    errors.push(...parseResult.errors)

    // Check for duplicates
    const duplicateWarnings = PluginParser.checkDuplicates(plugins)
    warnings.push(...duplicateWarnings)

    // Fetch plugin definitions in parallel
    const fetchPromises = plugins.map(async (plugin) => {
      try {
        plugin.definition = await this.fetchPlugin(plugin.ref)
      } catch {
        errors.push(ValidationErrors.unknownPlugin(plugin.alias, plugin.ref.fullName))
      }
    })

    await Promise.all(fetchPromises)

    return { plugins, errors, warnings }
  }

  /** Fetch a plugin definition from API or cache (public Hub only). */
  public async fetchPlugin(ref: PluginRef): Promise<PluginDefinition> {
    return this.service.getDefinition(ref)
  }

  /** Search public plugins in the Botpress hub. */
  public async searchPlugins(query: string, limit: number = 20): Promise<PluginSearchResult[]> {
    return this.source.search(query, limit)
  }

  /** List known public versions for a plugin name. */
  public async listPluginVersions(name: string): Promise<string[]> {
    return this.source.listVersions(name)
  }

  async getCacheStats(): Promise<{ count: number; sizeBytes: number }> {
    return this.service.getCacheStats()
  }

  async clearCache(): Promise<void> {
    await this.service.clearCache()
  }
}
