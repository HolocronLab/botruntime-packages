import { Bot, BotLogger } from '@holocronlab/botruntime-sdk'
import { parentPort } from 'worker_threads'

// ============================================================================
// WORKER THREAD LOGIC
// ============================================================================

/** Enable debug logging (controlled by BP_DEBUG env var) */
const DEBUG_ENABLED = process.env.BP_DEBUG === 'true' || process.env.BP_DEBUG === '1'
const logger = new BotLogger({})

interface WorkerMessage {
  type: 'event' | 'ready' | 'ack' | 'complete' | 'error' | 'log' | 'mem'
  taskId?: string
  event?: unknown
  error?: string
  level?: 'log' | 'info' | 'warn' | 'error' | 'debug'
  args?: unknown[]
  mem?: {
    heapUsed: number
    heapTotal: number
    external: number
    arrayBuffers: number
  }
}

/** How often each worker reports its isolate memory to the pool (dev telemetry). */
const MEMORY_REPORT_INTERVAL_MS = 5_000

/** Helper function for debug logging */
function debugLog(...args: unknown[]): void {
  if (DEBUG_ENABLED) {
    logger.debug(...args)
  }
}

/**
 * Main worker execution
 */
export function runWorker(bot: Bot): () => void {
  const expiryTime = process.env.WORKER_EXPIRY_TIME
    ? parseInt(process.env.WORKER_EXPIRY_TIME, 10)
    : Date.now() + 5 * 60 * 1000
  let lifetimeExpiryLogged = false

  if (!parentPort) {
    throw new Error('This script must be run as a worker thread')
  }

  // Set up message handler
  parentPort.on('message', async (message: WorkerMessage) => {
    const { type, taskId, event } = message

    if (type !== 'event' || !taskId) {
      logger.error(`Invalid message received:`, message)
      return
    }

    debugLog(`[Worker] Received task ${taskId}`)

    try {
      // Send acknowledgment
      parentPort!.postMessage({
        type: 'ack',
        taskId,
      })

      debugLog(`[Worker] Processing event for task ${taskId}...`)

      // Process the event
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- event comes from worker message, cast to SDK Request type
      const result = await bot.handler(event as any)

      debugLog(`[Worker] Task ${taskId} completed successfully`)

      // Send completion message
      parentPort!.postMessage({
        type: 'complete',
        taskId,
        result,
      })
    } catch (error) {
      logger.error(`Error processing task ${taskId}:`, error)

      // Send error message
      parentPort!.postMessage({
        type: 'error',
        taskId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  // Report this isolate's V8 heap to the pool periodically. RSS is omitted on
  // purpose: it is process-wide (shared across all worker threads), so only the
  // per-isolate heap figures are meaningful per worker. The pool aggregates these
  // for dev telemetry (see WorkerPool.getMemoryStats).
  const reportMemory = (): void => {
    const m = process.memoryUsage()
    parentPort!.postMessage({
      type: 'mem',
      mem: {
        heapUsed: m.heapUsed,
        heapTotal: m.heapTotal,
        external: m.external,
        arrayBuffers: m.arrayBuffers,
      },
    })
  }
  reportMemory()
  const memInterval = setInterval(reportMemory, MEMORY_REPORT_INTERVAL_MS)
  memInterval.unref?.()

  // Log remaining lifetime periodically (only in debug mode)
  const logInterval = setInterval(() => {
    const timeRemaining = expiryTime - Date.now()

    if (timeRemaining <= 0) {
      if (!lifetimeExpiryLogged) {
        lifetimeExpiryLogged = true
        debugLog(`[Worker] Lifetime expired; waiting for parent pool retirement`)
      }
      return
    }

    const minutes = Math.floor(timeRemaining / 60000)
    const seconds = Math.floor((timeRemaining % 60000) / 1000)

    debugLog(`[Worker] Time remaining: ${minutes}m ${seconds}s`)
  }, 30_000) // Log every 30 seconds

  // Cleanup on exit
  process.on('exit', () => {
    clearInterval(logInterval)
    clearInterval(memInterval)
  })

  return () => {
    parentPort!.postMessage({ type: 'ready' })
    debugLog(`[Worker] Ready to process tasks`)
  }
}
