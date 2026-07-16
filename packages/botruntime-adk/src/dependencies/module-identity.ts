import * as fs from 'fs'
import * as path from 'path'
import type { ResourceType } from './types.js'
import { bpModuleDirName } from '../utils/ids.js'

type GeneratedDependencyType = Extract<ResourceType, 'integration' | 'plugin'>

export type DependencyModuleIssueCode =
  | 'MODULE_MISSING'
  | 'MODULE_METADATA_MISSING'
  | 'MODULE_ID_MISSING'
  | 'MODULE_ID_MISMATCH'
  | 'MODULE_KIND_MISMATCH'
  | 'MODULE_NAME_MISMATCH'
  | 'MODULE_VERSION_MISMATCH'

export type DependencyModuleInventoryInspection =
  | { ready: true; names: string[] }
  | { ready: false; code: 'MODULE_INVENTORY_MISSING' | 'MODULE_INVENTORY_UNREADABLE'; reason: string }

export type DependencyModuleInspection =
  | {
      ready: true
      path: string
      identity: { type: ResourceType; id?: string; name: string; version: string }
    }
  | {
      ready: false
      path: string
      code: DependencyModuleIssueCode
      reason: string
    }

function stringField(source: string, field: string): string | undefined {
  const match = source.match(new RegExp(`\\b${field}\\s*:\\s*(["'])([^"']+)\\1`))
  return match?.[2]
}

/** Inspect the generated package object in bp_modules without executing it. */
export function inspectDependencyModule(input: {
  bpModulesDir: string
  type: GeneratedDependencyType
  alias: string
  id?: string
  name: string
  version: string
}): DependencyModuleInspection {
  const modulePath = path.join(input.bpModulesDir, bpModuleDirName(input.type, input.alias))
  let moduleDirectory = false
  try {
    moduleDirectory = fs.statSync(modulePath).isDirectory()
  } catch {
    moduleDirectory = false
  }
  if (!moduleDirectory) {
    return { ready: false, path: modulePath, code: 'MODULE_MISSING', reason: `module directory is missing` }
  }

  const metadataPath = path.join(modulePath, 'index.ts')
  let source: string
  try {
    source = fs.readFileSync(metadataPath, 'utf8')
  } catch {
    return {
      ready: false,
      path: metadataPath,
      code: 'MODULE_METADATA_MISSING',
      reason: 'generated package metadata index.ts is missing or unreadable',
    }
  }

  const type = stringField(source, 'type')
  const id = stringField(source, 'id')
  const name = stringField(source, 'name')
  const version = stringField(source, 'version')
  if (!type || !name || !version) {
    return {
      ready: false,
      path: metadataPath,
      code: 'MODULE_METADATA_MISSING',
      reason: 'generated package metadata must contain string type, name and version fields',
    }
  }
  if (type !== input.type) {
    return {
      ready: false,
      path: metadataPath,
      code: 'MODULE_KIND_MISMATCH',
      reason: `module type is ${type}; expected ${input.type}`,
    }
  }
  if (input.id && !id) {
    return {
      ready: false,
      path: metadataPath,
      code: 'MODULE_ID_MISSING',
      reason: `module definition id is missing; expected ${input.id}`,
    }
  }
  if (input.id && id !== input.id) {
    return {
      ready: false,
      path: metadataPath,
      code: 'MODULE_ID_MISMATCH',
      reason: `module definition id is ${id}; expected ${input.id}`,
    }
  }
  if (name !== input.name) {
    return {
      ready: false,
      path: metadataPath,
      code: 'MODULE_NAME_MISMATCH',
      reason: `module name is ${name}; expected ${input.name}`,
    }
  }
  if (version !== input.version) {
    return {
      ready: false,
      path: metadataPath,
      code: 'MODULE_VERSION_MISMATCH',
      reason: `module version is ${version}; expected ${input.version}`,
    }
  }
  return { ready: true, path: metadataPath, identity: { type: input.type, ...(id ? { id } : {}), name, version } }
}

export function listGeneratedDependencyModuleNames(bpModulesDir: string): string[] {
  const inventory = inspectDependencyModuleInventory(bpModulesDir)
  return inventory.ready ? inventory.names : []
}

export function isManagedGeneratedDependencyModule(bpModulesDir: string, moduleName: string): boolean {
  const expectedType = moduleName.startsWith('integration_')
    ? 'integration'
    : moduleName.startsWith('plugin_')
      ? 'plugin'
      : undefined
  if (!expectedType) return false

  try {
    const source = fs.readFileSync(path.join(bpModulesDir, moduleName, 'index.ts'), 'utf8')
    return (
      stringField(source, 'type') === expectedType &&
      stringField(source, 'name') !== undefined &&
      stringField(source, 'version') !== undefined
    )
  } catch {
    return false
  }
}

export function inspectDependencyModuleInventory(bpModulesDir: string): DependencyModuleInventoryInspection {
  if (!fs.existsSync(bpModulesDir)) {
    return { ready: false, code: 'MODULE_INVENTORY_MISSING', reason: 'bp_modules directory is missing' }
  }
  try {
    const names = fs
      .readdirSync(bpModulesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && (entry.name.startsWith('integration_') || entry.name.startsWith('plugin_')))
      .map((entry) => entry.name)
      .sort()
    return { ready: true, names }
  } catch (error) {
    return {
      ready: false,
      code: 'MODULE_INVENTORY_UNREADABLE',
      reason: `bp_modules inventory is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
