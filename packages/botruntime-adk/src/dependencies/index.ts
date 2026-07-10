export { DependencyManager } from './dependency-manager.js'
export type { DependencyManagerOptions, ResourceEntry } from './dependency-manager.js'

export {
  dependencyStateSchema,
  dependencySnapshotTargetSchema,
  dependencyMigrationPendingSchema,
  dependencyMigrationSourceSchema,
  dependencyMigrationPlanSchema,
  dependencyMigrationCompletionRecordSchema,
  dependencyMigrationMarkerSchema,
  type Environment,
  type ResourceType,
  type IntegrationDependencyEntry,
  type PluginDependencyEntry,
  type IntegrationSnapshotEntry,
  type PluginSnapshotEntry,
  type PluginDependencyMapping,
  type DependencyStateData,
  type DependencySnapshotData,
  type DependencySnapshotTarget,
  type DependencyTargetScope,
  type DependencyMigrationMarker,
  type DependencyMigrationPending,
  type DependencyMigrationProgress,
  type DependencyMigrationSource,
  type DependencyMigrationPlan,
  type DependencyMigrationCompletionRecord,
  type AddSpec,
  type ConfigPatch,
  type MutationResult,
  type DiffResult,
  type ApplyAction,
  type ApplyResult,
  type MigrationResult,
  type DependencyStatus,
} from './types.js'

export { computeIntegrationStatus, computePluginStatus, isCallable } from './status.js'
export { resolveDependencyStatuses, type ResolveDependencyStatusesInput } from './status-resolver.js'
export {
  reconcileDependencyReadiness,
  type CloudDependencyReadiness,
  type CloudReadinessDependency,
  type CloudReadinessProjection,
  type DependencyReadinessIssue,
  type DependencyReadinessIssueCode,
  type DependencyReadinessReport,
} from './readiness-reconciler.js'
export {
  inspectDependencyModule,
  inspectDependencyModuleInventory,
  listGeneratedDependencyModuleNames,
  type DependencyModuleInspection,
  type DependencyModuleInventoryInspection,
  type DependencyModuleIssueCode,
} from './module-identity.js'

export { DependencyError, DEPENDENCY_ERROR_CODES, DEPENDENCY_WARNING_CODES } from './errors.js'
export type { DependencyErrorCode, DependencyWarningCode } from './errors.js'

export { sortKeysDeep, jsonEqual } from './json-utils.js'

export { IntegrationRegistry } from './registry/integration-registry.js'
export { PluginRegistry } from './registry/plugin-registry.js'
export { InterfaceRegistry } from './registry/interface-registry.js'
export type { InterfaceInfo } from './registry/interface-registry.js'

export { IntegrationResolver } from './resolvers/integration-resolver.js'
export { PluginResolver } from './resolvers/plugin-resolver.js'

export {
  DependencySnapshotStore,
  emptyDependencySnapshot,
  dependencySnapshotFromBot,
  normalizeDependencySnapshotTarget,
  type IntegrationAuthorizationSpecSource,
  type DependencySnapshotWarning,
  type DependencySnapshotStoreOptions,
} from './snapshot-store.js'

export { DependencyMigrationManager, migrateFromConfig } from './migration.js'
export type { DependencyMigrationAuthority, MigrateOptions } from './migration.js'

export { refreshCompletedDependencySnapshot } from './completed-snapshot-refresh.js'
export type {
  CompletedDependencySnapshotRefreshResult,
  RefreshCompletedDependencySnapshotOptions,
} from './completed-snapshot-refresh.js'
