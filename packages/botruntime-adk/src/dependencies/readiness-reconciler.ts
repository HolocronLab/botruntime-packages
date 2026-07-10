import type {
  DependencySnapshotData,
  DependencySnapshotTarget,
  DependencyStatus,
  ResourceType,
} from './types.js'
import { dependencySnapshotSchema } from './types.js'
import { inspectDependencyModule, inspectDependencyModuleInventory } from './module-identity.js'
import { normalizeDependencySnapshotTarget } from './snapshot-store.js'
import { bpModuleDirName } from '../utils/ids.js'

export interface CloudReadinessDependency {
  id?: string
  installationId?: string
  name?: string
  version?: string
  enabled?: boolean
  configurationType?: string
  configurationRevision?: string
  status?: string
  statusReason?: string
}

export type CloudReadinessProjection =
  | {
      authority: 'authoritative'
      source: string
      items: Record<string, CloudReadinessDependency>
    }
  | {
      authority: 'unknown'
      reason: string
      items?: Record<string, CloudReadinessDependency>
    }

export interface CloudDependencyReadiness {
  botUpdatedAt?: string
  integrations?: CloudReadinessProjection
  plugins?: CloudReadinessProjection
  lastDevDeployment?: { authority: 'authoritative'; revision: string } | { authority: 'unknown'; reason: string }
}

export type DependencyReadinessIssueCode =
  | 'SNAPSHOT_ENV_MISMATCH'
  | 'SNAPSHOT_STALE'
  | 'SNAPSHOT_TARGET_MISMATCH'
  | 'SNAPSHOT_CLOUD_ALIAS_DUPLICATE'
  | 'CLOUD_RESPONSE_PARTIAL'
  | 'CLOUD_AUTHORITY_UNKNOWN'
  | 'CLOUD_DEPENDENCY_MISSING'
  | 'CLOUD_DEPENDENCY_UNEXPECTED'
  | 'CLOUD_DEPENDENCY_PARTIAL'
  | 'SNAPSHOT_CLOUD_ID_MISSING'
  | 'CLOUD_ID_MISSING'
  | 'CLOUD_ID_MISMATCH'
  | 'CLOUD_INSTALLATION_ID_MISSING'
  | 'CLOUD_NAME_MISMATCH'
  | 'CLOUD_VERSION_MISMATCH'
  | 'CLOUD_CONFIGURATION_TYPE_MISMATCH'
  | 'CLOUD_ENABLED_MISMATCH'
  | 'SNAPSHOT_CONFIGURATION_REVISION_MISSING'
  | 'CLOUD_CONFIGURATION_REVISION_MISSING'
  | 'CLOUD_CONFIGURATION_REVISION_MISMATCH'
  | 'CLOUD_LIFECYCLE_NOT_READY'
  | 'PLUGIN_CLOUD_STATE_UNKNOWN'
  | 'MODULE_MISSING'
  | 'MODULE_METADATA_MISSING'
  | 'MODULE_ID_MISSING'
  | 'MODULE_ID_MISMATCH'
  | 'MODULE_KIND_MISMATCH'
  | 'MODULE_NAME_MISMATCH'
  | 'MODULE_VERSION_MISMATCH'
  | 'MODULE_UNEXPECTED'
  | 'MODULE_PATH_COLLISION'
  | 'MODULE_INVENTORY_MISSING'
  | 'MODULE_INVENTORY_UNREADABLE'

export interface DependencyReadinessIssue {
  code: DependencyReadinessIssueCode
  message: string
  type?: ResourceType
  alias?: string
}

export interface DependencyReadinessReport {
  ok: boolean
  statuses: DependencyStatus[]
  issues: DependencyReadinessIssue[]
  revisions: { snapshotBotUpdatedAt?: string; cloudBotUpdatedAt?: string }
}

type MutableStatus = DependencyStatus
type ReconciledDependencyType = Extract<ResourceType, 'integration' | 'plugin'>

function localStatus(type: ReconciledDependencyType, alias: string, entry: any): MutableStatus {
  let verdict: Pick<DependencyStatus, 'state' | 'missingFields' | 'reason'>
  if (entry.authorizationPending) {
    verdict = { state: 'unconfigured', reason: 'requires authorization' }
  } else if (entry.missingFields?.length) {
    verdict = { state: 'unconfigured', missingFields: entry.missingFields }
  } else if (!entry.enabled) {
    verdict = { state: 'disabled' }
  } else {
    verdict = { state: 'available' }
  }
  return {
    type,
    alias,
    name: entry.name,
    version: entry.version,
    enabled: entry.enabled,
    ...verdict,
  }
}

function block(status: MutableStatus, reason: string): void {
  if (status.state === 'unconfigured' || status.state === 'not_installed') return
  status.state = 'unresolved'
  status.reason = reason
  delete status.missingFields
}

export async function reconcileDependencyReadiness(input: {
  snapshot: DependencySnapshotData
  expectedTarget: DependencySnapshotTarget
  bpModulesDir: string
  cloud: CloudDependencyReadiness
}): Promise<DependencyReadinessReport> {
  const issues: DependencyReadinessIssue[] = []
  const statuses: MutableStatus[] = []
  const statusByKey = new Map<string, MutableStatus>()
  const addIssue = (issue: DependencyReadinessIssue): void => {
    issues.push(issue)
  }

  const snapshot = dependencySnapshotSchema.parse(input.snapshot)
  const expectedTarget = normalizeDependencySnapshotTarget(input.expectedTarget)
  const snapshotTarget = normalizeDependencySnapshotTarget({
    env: snapshot.env,
    ...snapshot.target,
  })

  if (snapshotTarget.env !== expectedTarget.env) {
    addIssue({
      code: 'SNAPSHOT_ENV_MISMATCH',
      message: `snapshot env is ${snapshotTarget.env}; expected ${expectedTarget.env}`,
    })
  }
  if (snapshot.stale === true) {
    addIssue({ code: 'SNAPSHOT_STALE', message: 'snapshot is explicitly marked stale' })
  }

  const targetMismatches = (['apiUrl', 'workspaceId', 'botId'] as const).filter(
    (field) => snapshotTarget[field] !== expectedTarget[field]
  )
  if (targetMismatches.length > 0) {
    addIssue({
      code: 'SNAPSHOT_TARGET_MISMATCH',
      message: targetMismatches
        .map(
          (field) =>
            `snapshot ${field} is ${snapshotTarget[field]}; expected ${expectedTarget[field]}`
        )
        .join('; '),
    })
  }

  const expectedModuleNames = new Set<string>()
  const moduleOwners = new Map<string, string>()
  const cloudAliasOwners = new Map<string, string>()
  for (const type of ['integration', 'plugin'] as const) {
    const entries = type === 'integration' ? snapshot.integrations : snapshot.plugins
    for (const alias of Object.keys(entries).sort()) {
      const entry = entries[alias]!
      const status = localStatus(type, alias, entry)
      statuses.push(status)
      statusByKey.set(`${type}:${alias}`, status)
      const cloudAlias = entry.cloudAlias ?? alias
      const cloudAliasKey = `${type}:${cloudAlias}`
      const existingCloudAliasOwner = cloudAliasOwners.get(cloudAliasKey)
      if (existingCloudAliasOwner) {
        const reason = `snapshot aliases ${existingCloudAliasOwner} and ${alias} both claim Cloud alias ${cloudAlias}`
        addIssue({ code: 'SNAPSHOT_CLOUD_ALIAS_DUPLICATE', type, alias, message: reason })
        block(status, reason)
        block(statusByKey.get(`${type}:${existingCloudAliasOwner}`)!, reason)
      } else {
        cloudAliasOwners.set(cloudAliasKey, alias)
      }
      const moduleName = bpModuleDirName(type, alias)
      const existingModuleOwner = moduleOwners.get(moduleName)
      if (existingModuleOwner) {
        const reason = `dependency aliases ${existingModuleOwner.split(':')[1]} and ${alias} resolve to ${moduleName}`
        addIssue({ code: 'MODULE_PATH_COLLISION', type, alias, message: reason })
        block(status, reason)
        block(statusByKey.get(existingModuleOwner)!, reason)
      } else {
        moduleOwners.set(moduleName, `${type}:${alias}`)
      }
      expectedModuleNames.add(moduleName)
      const module = inspectDependencyModule({
        bpModulesDir: input.bpModulesDir,
        type,
        alias,
        ...(entry.cloudId ? { id: entry.cloudId } : {}),
        name: entry.name,
        version: entry.version,
      })
      if (!module.ready) {
        addIssue({ code: module.code, type, alias, message: module.reason })
        status.state = 'not_installed'
        status.reason = module.reason
        delete status.missingFields
      }
    }
  }

  const inventory = inspectDependencyModuleInventory(input.bpModulesDir)
  if (!inventory.ready) {
    addIssue({ code: inventory.code, message: inventory.reason })
  } else {
    for (const moduleName of inventory.names) {
      if (!expectedModuleNames.has(moduleName)) {
        addIssue({ code: 'MODULE_UNEXPECTED', message: `unexpected generated dependency module ${moduleName}` })
      }
    }
  }

  const integrationProjection = input.cloud.integrations
  if (!integrationProjection) {
    addIssue({ code: 'CLOUD_RESPONSE_PARTIAL', message: 'Cloud response omitted integration authority metadata' })
  } else if (integrationProjection.authority !== 'authoritative') {
    addIssue({
      code: 'CLOUD_AUTHORITY_UNKNOWN',
      message: `Cloud integration state is not authoritative: ${integrationProjection.reason}`,
    })
  } else {
    reconcileAuthoritativeProjection({
      type: 'integration',
      snapshotEntries: snapshot.integrations,
      projection: integrationProjection.items,
      statuses: statusByKey,
      addIssue,
    })
  }

  const pluginProjection = input.cloud.plugins
  if (!pluginProjection) {
    addIssue({ code: 'CLOUD_RESPONSE_PARTIAL', message: 'Cloud response omitted plugin authority metadata' })
  } else if (pluginProjection.authority === 'unknown') {
    for (const [alias, entry] of Object.entries(snapshot.plugins).sort(([a], [b]) => a.localeCompare(b))) {
      if (!entry.enabled || entry.missingFields?.length) continue
      addIssue({
        code: 'PLUGIN_CLOUD_STATE_UNKNOWN',
        type: 'plugin',
        alias,
        message: `enabled plugin Cloud state is unknown: ${pluginProjection.reason}`,
      })
      block(statusByKey.get(`plugin:${alias}`)!, 'enabled plugin Cloud state is unknown')
    }
  } else {
    reconcileAuthoritativeProjection({
      type: 'plugin',
      snapshotEntries: snapshot.plugins,
      projection: pluginProjection.items,
      statuses: statusByKey,
      addIssue,
    })
  }

  const integrationsByAlias = new Map(
    statuses.filter((status) => status.type === 'integration').map((status) => [status.alias, status])
  )
  for (const [alias, entry] of Object.entries(snapshot.plugins).sort(([a], [b]) => a.localeCompare(b))) {
    const status = statusByKey.get(`plugin:${alias}`)!
    if (!entry.enabled || status.state === 'not_installed' || status.state === 'unconfigured') continue
    const blockedDependency = Object.values(entry.dependencies).find((dep) => {
      const integration = integrationsByAlias.get(dep.integrationAlias)
      return !integration || integration.state !== 'available'
    })
    if (blockedDependency) block(status, `backing integration ${blockedDependency.integrationAlias} is not ready`)
  }

  const blockingStatus = statuses.some(
    (status) => status.state !== 'available' && status.state !== 'disabled'
  )
  return {
    ok: issues.length === 0 && !blockingStatus,
    statuses,
    issues,
    revisions: {
      ...(snapshot.botUpdatedAt ? { snapshotBotUpdatedAt: snapshot.botUpdatedAt } : {}),
      ...(input.cloud.botUpdatedAt ? { cloudBotUpdatedAt: input.cloud.botUpdatedAt } : {}),
    },
  }
}

function reconcileAuthoritativeProjection(input: {
  type: ReconciledDependencyType
  snapshotEntries: Record<string, any>
  projection: Record<string, CloudReadinessDependency>
  statuses: Map<string, MutableStatus>
  addIssue: (issue: DependencyReadinessIssue) => void
}): void {
  const desiredCloudAliases = new Map<string, string>()
  for (const alias of Object.keys(input.snapshotEntries).sort()) {
    const entry = input.snapshotEntries[alias]!
    const cloudAlias = entry.cloudAlias ?? alias
    const status = input.statuses.get(`${input.type}:${alias}`)!
    desiredCloudAliases.set(cloudAlias, alias)
    const cloud = input.projection[cloudAlias]
    if (!cloud) {
      input.addIssue({
        code: 'CLOUD_DEPENDENCY_MISSING',
        type: input.type,
        alias,
        message: `Cloud is missing ${input.type} alias ${cloudAlias}`,
      })
      block(status, 'dependency is missing from authoritative Cloud state')
      continue
    }

    const required = [cloud.name, cloud.version, cloud.enabled]
    if (required.some((value) => value === undefined || value === '')) {
      input.addIssue({
        code: 'CLOUD_DEPENDENCY_PARTIAL',
        type: input.type,
        alias,
        message: 'Cloud dependency identity is incomplete',
      })
      block(status, 'Cloud dependency identity is incomplete')
      continue
    }
    const mismatch = (code: DependencyReadinessIssueCode, message: string): void => {
      input.addIssue({ code, type: input.type, alias, message })
      block(status, message)
    }
    if (cloud.name !== entry.name) mismatch('CLOUD_NAME_MISMATCH', `Cloud name is ${cloud.name}; expected ${entry.name}`)
    if (cloud.version !== entry.version) {
      mismatch('CLOUD_VERSION_MISMATCH', `Cloud version is ${cloud.version}; expected ${entry.version}`)
    }
    if (cloud.enabled !== entry.enabled) {
      mismatch('CLOUD_ENABLED_MISMATCH', `Cloud enabled is ${String(cloud.enabled)}; expected ${String(entry.enabled)}`)
    }

    if (input.type === 'integration') {
      if (typeof cloud.installationId !== 'string' || cloud.installationId === '') {
        mismatch('CLOUD_INSTALLATION_ID_MISSING', 'Cloud installationId is missing')
      }
      if (typeof entry.cloudId !== 'string' || entry.cloudId === '') {
        mismatch('SNAPSHOT_CLOUD_ID_MISSING', 'snapshot integration definition cloudId is missing')
      } else {
        if (typeof cloud.id !== 'string' || cloud.id === '') {
          mismatch('CLOUD_ID_MISSING', 'Cloud integration definition id is missing')
        } else if (cloud.id !== entry.cloudId) {
          mismatch('CLOUD_ID_MISMATCH', `Cloud integration definition id is ${cloud.id}; expected ${entry.cloudId}`)
        }
      }
    }

    if (input.type === 'integration') {
      const expectedConfigurationType = entry.configurationType ?? 'default'
      if (typeof cloud.configurationType !== 'string') {
        mismatch('CLOUD_DEPENDENCY_PARTIAL', 'Cloud configurationType is missing')
      } else if (cloud.configurationType !== expectedConfigurationType) {
        mismatch(
          'CLOUD_CONFIGURATION_TYPE_MISMATCH',
          `Cloud configurationType is ${cloud.configurationType}; expected ${expectedConfigurationType}`
        )
      }
      if (typeof entry.configurationRevision !== 'string' || entry.configurationRevision === '') {
        mismatch('SNAPSHOT_CONFIGURATION_REVISION_MISSING', 'snapshot configurationRevision is missing')
      } else if (typeof cloud.configurationRevision !== 'string' || cloud.configurationRevision === '') {
        mismatch('CLOUD_CONFIGURATION_REVISION_MISSING', 'Cloud configurationRevision is missing')
      } else if (cloud.configurationRevision !== entry.configurationRevision) {
        mismatch('CLOUD_CONFIGURATION_REVISION_MISMATCH', 'Cloud configurationRevision differs from snapshot')
      }
    }

    if (entry.enabled && status.state !== 'unconfigured') {
      const lifecycle = cloud.status?.trim().toLowerCase()
      const ready = input.type === 'integration' ? lifecycle === 'registered' : lifecycle === 'active'
      if (!ready) {
        mismatch('CLOUD_LIFECYCLE_NOT_READY', `Cloud lifecycle is ${lifecycle || 'unknown'}`)
      }
    }
  }

  for (const cloudAlias of Object.keys(input.projection).sort()) {
    if (!desiredCloudAliases.has(cloudAlias)) {
      input.addIssue({
        code: 'CLOUD_DEPENDENCY_UNEXPECTED',
        type: input.type,
        alias: cloudAlias,
        message: `Cloud has unexpected ${input.type} alias ${cloudAlias}`,
      })
    }
  }
}
