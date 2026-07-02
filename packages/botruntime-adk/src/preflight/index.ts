export { PreflightChecker } from './checker.js'
export {
  assertNoBlockingDependencies,
  findIntegrationVersionMismatches,
  summarizeBlockingDependencies,
  isDeployBlocking,
  type BlockingDependencySummary,
} from './dependency-gate.js'
export { pluralize } from './types.js'
export type {
  PreflightCheckResult,
  SecretWarning,
  DeployPlan,
  DeployPlanManagers,
  IntegrationVersionMismatch,
  ApplyOptions,
  OrphanedKB,
  SyncCallbacks,
} from './types.js'
export type { PendingPreflightResult } from './checker.js'
