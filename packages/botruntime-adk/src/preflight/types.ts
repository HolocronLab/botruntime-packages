import type { Environment } from '../secrets/manager.js'
import type { TableSyncPlan } from '../tables/types.js'
import type { KBSyncPlan } from '../knowledge/types.js'
import type { AssetSyncPlan } from '../assets/types.js'
import type { TableManager } from '../tables/table-manager.js'
import type { KnowledgeManager } from '../knowledge/manager.js'
import type { AssetsManager } from '../assets/manager.js'
import type { DependencyStatus } from '../dependencies/types.js'

export interface AgentConfigDiff {
  field: string
  oldValue: unknown
  newValue: unknown
}

export interface SecretWarning {
  name: string
  optional: boolean
  description?: string
}

export interface PreflightCheckResult {
  agentConfig: AgentConfigDiff[]
  secretWarnings: SecretWarning[]
  env: Environment
  hasChanges: boolean
}

export interface SyncCallbacks {
  onProgress?: (message: string) => void
  onSuccess?: (message: string) => void
  onError?: (message: string) => void
}

export interface ApplyOptions extends SyncCallbacks {
  skipBotRegeneration?: boolean
}

export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

export interface OrphanedKB {
  id: string
  name: string
}

export interface DeployPlanManagers {
  table: TableManager | null
  kb: KnowledgeManager | null
  assets: AssetsManager | null
}

export interface IntegrationVersionMismatch {
  type: 'integration'
  alias: string
  name: string
  devVersion: string
  prodVersion: string
}

export interface DeployPlan {
  preflight: {
    result: PreflightCheckResult
    apply: (options?: ApplyOptions) => Promise<void>
  }
  tablePlan: TableSyncPlan | null
  kbPlan: KBSyncPlan | null
  orphanedKBs: OrphanedKB[]
  assetPlan: AssetSyncPlan | null
  hasDestructiveStorageChanges: boolean
  managers: DeployPlanManagers
  /**
   * Dependency capability gate (WS5): enabled dependencies in the target snapshot whose
   * state is not `available` (unconfigured / unresolved / not_installed / errored).
   * A non-empty `blocking` set makes `brt deploy --adk` fail with `UNCONFIGURED_DEPENDENCIES`
   * unless the embedding caller explicitly opts into inert dependencies. Empty on a first deploy.
   */
  dependencyPlan: {
    blocking: DependencyStatus[]
    integrationVersionMismatches: IntegrationVersionMismatch[]
  }
}
