import { AdkError } from '@holocronlab/botruntime-analytics'
import type { InterfaceDefinition, InterfaceRef } from '../../interfaces/types.js'
import { CatalogClientFactory } from './client-factory.js'
import type { CatalogSource, ResolvedSpec } from './catalog-service.js'

/**
 * Cloud-fetch logic for interfaces — **fetch-by-ref ONLY**. Moved verbatim from
 * the old InterfaceManager.fetchInterface.
 *
 * Deliberately exposes no `search` / `listVersions` / enumeration: the set of
 * interfaces an ADK project can use is fixed by the `BUILTIN_INTERFACES` constant
 * (see `InterfaceRegistry`, which stays constants-only). This source only resolves
 * a known `name@version` ref to its cloud definition; it must never grow a listing
 * API, or it would undermine the built-in-interface-immutable invariant.
 */
export class InterfaceCatalogSource implements CatalogSource<InterfaceDefinition, InterfaceRef> {
  readonly cacheConfig = { cacheType: 'interfaces', idField: 'interfaceId' }

  constructor(private readonly clientFactory: CatalogClientFactory) {}

  async fetchByRef(ref: InterfaceRef): Promise<ResolvedSpec<InterfaceDefinition>> {
    const client = await this.clientFactory.getClient()
    let interfaceResponse: { interface: InterfaceDefinition } | undefined
    let versionError: Error | null = null

    try {
      interfaceResponse = await client.getInterfaceByName({
        name: ref.name,
        version: ref.version,
      })
    } catch {
      try {
        interfaceResponse = await client.getPublicInterface({
          name: ref.name,
          version: ref.version,
        })
      } catch (publicError) {
        versionError = publicError as Error
      }
    }

    if (!interfaceResponse && versionError) {
      let latestVersion: string | null = null
      try {
        const latestPrivate = await client.getInterfaceByName({
          name: ref.name,
          version: 'latest',
        })
        latestVersion = latestPrivate.interface.version
      } catch {
        try {
          const latestPublic = await client.getPublicInterface({
            name: ref.name,
            version: 'latest',
          })
          latestVersion = latestPublic.interface.version
        } catch {
          const location = ref.workspace ? `workspace "${ref.workspace}"` : 'the official Botpress hub'
          throw new AdkError({
            code: 'INTERFACE_NOT_FOUND',
            message: `Interface "${ref.name}" does not exist in ${location}`,
            expected: true,
          })
        }
      }
      const location = ref.workspace ? `workspace "${ref.workspace}"` : 'Botpress'
      throw new AdkError({
        // 'VERSION_NOT_FOUND' is the registered DependencyErrorCode the CLI
        // classifies as user-fixable (exit 1); an unlisted code would fall
        // through to the system-error class.
        code: 'VERSION_NOT_FOUND',
        message: `Interface "${ref.name}" version "${ref.version}" not found in ${location}. Latest available version is "${latestVersion}"`,
        expected: true,
      })
    }

    const intf = interfaceResponse!.interface
    return { id: intf.id, updatedAt: intf.updatedAt, definition: intf }
  }
}
