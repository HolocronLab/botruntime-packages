export type PackageVersions = {
  runtime: string
  adk: string
  sdk: string
  llmz: string
  zai: string
  cognitive: string
}

export type BuildInfo = {
  date: string
}

export type Globals = {
  __BUILD__: BuildInfo
  __PACKAGE_VERSIONS__: PackageVersions
}

declare global {
  const __BUILD__: BuildInfo
  const __PACKAGE_VERSIONS__: PackageVersions
}

export const DefinedGlobalObjects = ['__PACKAGE_VERSIONS__', '__BUILD__'] as const satisfies readonly (keyof Globals)[]

const _global = globalThis as Record<string, unknown>
const _defined = DefinedGlobalObjects as unknown as Record<string, unknown>

for (const key of Object.keys(DefinedGlobalObjects)) {
  if (typeof _global[key] === 'string') {
    try {
      _global[key] = JSON.parse(_global[key] as string)
    } catch {
      _global[key] = _defined[key]
    }
  }
}
