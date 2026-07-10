import type { Client } from '@holocronlab/botruntime-client'
import { withDependencyMigrationLock } from './migration-mutex.js'
import { DependencySnapshotStore } from './snapshot-store.js'
import type { DependencySnapshotTarget } from './types.js'

export type CompletedDependencySnapshotRefreshResult =
  | { status: 'refreshed' }
  | { status: 'not-initialized' }

export interface RefreshCompletedDependencySnapshotOptions {
  projectPath: string
  client: Pick<Client, 'getBot'>
  target: DependencySnapshotTarget
  runtimeBotId?: string
}

/**
 * Refreshes an already-initialized dependency snapshot as one lock-scoped
 * state transition. The exact completion record is deliberately checked only
 * after acquiring the migration mutex; callers must not split marker probing
 * from the Cloud read/snapshot commit or a concurrent migration can publish a
 * stale snapshot after a successful stateful mutation.
 */
export async function refreshCompletedDependencySnapshot(
  opts: RefreshCompletedDependencySnapshotOptions
): Promise<CompletedDependencySnapshotRefreshResult> {
  return withDependencyMigrationLock(opts.projectPath, async () => {
    const store = new DependencySnapshotStore({ projectPath: opts.projectPath })
    if (!(await store.hasMigrationMarker(opts.target))) {
      return { status: 'not-initialized' }
    }

    await store.refreshFromCloud({
      client: opts.client as Client,
      target: opts.target,
      ...(opts.target.env === 'dev' ? { runtimeBotId: opts.runtimeBotId } : {}),
      requireAuthoritative: true,
    })
    return { status: 'refreshed' }
  })
}
