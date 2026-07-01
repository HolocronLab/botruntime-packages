import { WorkerPool } from './worker_pool'
import { handleInspectorRequest } from '../runtime/context/inspector-handler'
import { BotLogger } from '@holocronlab/botruntime-sdk'

/** Enable debug logging (controlled by BP_DEBUG env var) */
const DEBUG_ENABLED = process.env.BP_DEBUG === 'true' || process.env.BP_DEBUG === '1'
const logger = new BotLogger({})

/** Helper function for debug logging */
function debugLog(...args: unknown[]): void {
  if (DEBUG_ENABLED) {
    logger.debug(...args)
  }
}

/** Global worker pool instance (accessible for stats queries) */
let globalWorkerPool: WorkerPool | null = null

/**
 * Get the global worker pool instance (for stats queries)
 */
export function getWorkerPool(): WorkerPool | null {
  return globalWorkerPool
}

/**
 * Initialize the main thread with worker pool
 */
export function initializeParentWorker(bot: Record<string, unknown>): void {
  debugLog('[Main] Initializing bot with worker pool...')

  const pool = new WorkerPool()
  globalWorkerPool = pool

  // Override bot handler to use worker pool
  bot.handler = async (event: Record<string, unknown>) => {
    debugLog('[Main] Received event, delegating to worker pool:', event.type || 'unknown')

    // Handle inspector debug requests on the MAIN THREAD (not in workers).
    // The handler delegates to handleInspectorRequest(), which currently returns
    // the main process PID (and does not include an inspector port in the response).
    if (process.env.NODE_ENV === 'development' && event.path === '/__debug/inspector' && event.method === 'POST') {
      debugLog('[Main] Handling inspector enable on main thread')
      return await handleInspectorRequest()
    }

    const workerStats = pool.getWorkerStats()
    debugLog(
      `[Main] Pool stats - Total: ${workerStats.total}, Starting: ${workerStats.starting}, ` +
        `Idle: ${workerStats.idle}, Busy: ${workerStats.busy}`
    )

    try {
      const result = await pool.executeTask(event)
      debugLog('[Main] Event processed successfully by worker, result:', result)
      return result
    } catch (error) {
      logger.error('[Main] Error processing event:', error)
      throw error
    }
  }

  let statsInterval: ReturnType<typeof setInterval> | null = null

  // Graceful shutdown
  const shutdown = async () => {
    debugLog('[Main] Shutting down...')
    if (statsInterval) {
      clearInterval(statsInterval)
      statsInterval = null
    }
    await pool.shutdown()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  debugLog('[Main] Bot initialized with worker pool')

  // Periodically emit worker stats as structured logs
  // Use 5s interval to reduce pipe traffic and native memory pressure
  statsInterval = setInterval(() => {
    const stats = pool.getWorkerStats()
    const detailedStats = pool.getStats()
    const mem = pool.getMemoryStats()
    const toMb = (bytes: number): number => Math.round(bytes / 1048576)

    // Intentionally use console.log for this metric envelope. The structured
    // logging shim recognizes type=worker_stats and posts it to /v1/worker-stats
    // instead of the normal log channel.
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'worker_stats',
        stats: {
          total: stats.total,
          starting: stats.starting,
          idle: stats.idle,
          busy: stats.busy,
          terminated: stats.terminated,
          queueSize: detailedStats.currentQueueSize,
          poolSize: mem.poolSize,
          minWorkers: mem.minWorkers,
          peakBusyWorkers: mem.peakBusyWorkers,
          peakQueueDepth: mem.peakQueueDepth,
          processRssMb: toMb(mem.mainThread.rss),
          mainThreadHeapMb: toMb(mem.mainThread.heapUsed),
          workers: mem.workers.map((w) => ({
            id: w.id,
            status: w.status,
            heapMb: w.mem ? toMb(w.mem.heapTotal) : null,
          })),
        },
      })
    )
  }, 5000)
}
