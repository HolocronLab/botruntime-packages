import { Worker } from 'worker_threads'
import { existsSync } from 'fs'
import path from 'path'
import { BotLogger } from '@holocronlab/botruntime-sdk'
import { getConfiguredDevRequestTimeoutMs, parsePositiveInt } from './request-timeout'

// ============================================================================
// WORKER POOL CONFIGURATION - Tweak these constants as needed
// ============================================================================

/** Enable debug logging for worker pool (controlled by BP_DEBUG env var) */
const DEBUG_ENABLED = process.env.BP_DEBUG === 'true' || process.env.BP_DEBUG === '1'
const logger = new BotLogger({})

/** Helper function for debug logging */
function debugLog(...args: unknown[]): void {
  if (DEBUG_ENABLED) {
    logger.debug(...args)
  }
}

const DEFAULT_WORKER_POOL_SIZE = 10

/** Warm floor the pool never scales below — always kept alive for zero-latency dispatch. */
const DEFAULT_MIN_WORKER_POOL_SIZE = 2

export function getConfiguredWorkerPoolSize(value: string | undefined): number {
  return parsePositiveInt(value, DEFAULT_WORKER_POOL_SIZE)
}

export function getConfiguredMinWorkerPoolSize(value: string | undefined): number {
  return parsePositiveInt(value, DEFAULT_MIN_WORKER_POOL_SIZE)
}

/** Maximum worker threads — the autoscaling ceiling (also the pre-autoscaling fixed size). */
export const WORKER_POOL_SIZE = getConfiguredWorkerPoolSize(process.env.ADK_DEV_WORKER_POOL_SIZE)

/** Minimum (warm) worker threads — the autoscaling floor. */
export const MIN_WORKER_POOL_SIZE = getConfiguredMinWorkerPoolSize(process.env.ADK_DEV_WORKER_MIN_SIZE)

/** How long a worker must sit idle before it is retired down toward the floor (default: 60s). */
export const WORKER_IDLE_SCALE_DOWN_MS = 60 * 1000

/** Worker lifetime in milliseconds (default: 5 minutes) */
export const WORKER_LIFETIME_MS = process.env.WORKER_LIFETIME_MS
  ? Math.max(parseInt(process.env.WORKER_LIFETIME_MS, 10), 1 * 60 * 1000)
  : 5 * 60 * 1000

/** Minimum lifetime remaining before replacing worker (default: 30 seconds) */
export const WORKER_MIN_LIFETIME_MS = 30 * 1000

/** Timeout for worker acknowledgment in milliseconds (default: 5 seconds) */
export const WORKER_ACK_TIMEOUT_MS = 5 * 1000

/** Interval for checking worker expiry (default: 10 seconds) */
export const WORKER_EXPIRY_CHECK_INTERVAL_MS = 10 * 1000

/** Maximum time a request can wait in queue (default: 30 seconds) */
export const QUEUE_TIMEOUT_MS = 30 * 1000

/** A worker dying sooner than this after spawn counts as a "fast crash" (likely a broken/missing script) */
export const WORKER_FAST_CRASH_THRESHOLD_MS = 5 * 1000

/** Base delay between respawns once fast crashes are detected (doubles per consecutive fast crash) */
export const WORKER_RESPAWN_BASE_DELAY_MS = 100

/** Maximum backoff delay between respawn attempts */
export const WORKER_RESPAWN_MAX_DELAY_MS = 5 * 1000

/** After this many consecutive fast crashes the pool halts respawning and waits for recovery */
export const WORKER_MAX_CONSECUTIVE_FAST_CRASHES = 5

/** While halted, retry a single probe worker at this interval (default: 30 seconds) */
export const WORKER_POOL_RECOVERY_INTERVAL_MS = 30 * 1000

// ============================================================================
// TYPES
// ============================================================================

type WorkerStatus = 'starting' | 'idle' | 'busy' | 'terminated'

/**
 * Per-isolate V8 memory, self-reported by each worker. RSS is deliberately omitted:
 * worker threads share one OS process, so `process.memoryUsage().rss` is identical
 * across threads and only meaningful when read once on the main thread. heapTotal/
 * heapUsed/external/arrayBuffers are per-isolate and are the real per-worker cost.
 */
interface IsolateMemory {
  heapUsed: number
  heapTotal: number
  external: number
  arrayBuffers: number
}

interface WorkerInfo {
  worker: Worker
  status: WorkerStatus
  startTime: number
  expiryTime: number
  currentTaskId?: string | undefined
  /** Resets the consecutive-fast-crash counter once the worker proves stable */
  stabilityTimer?: Timer | undefined
  /** Latest self-reported isolate memory, used for dev telemetry (see getMemoryStats) */
  lastMem?: IsolateMemory | undefined
  /** When this worker last became idle; drives idle-based scale-down. undefined while busy. */
  becameIdleAt?: number | undefined
}

/** Tunables for autoscaling + crash-loop handling — overridable for tests */
export interface WorkerPoolOptions {
  /** Autoscaling ceiling (max workers). */
  poolSize?: number
  /** Autoscaling floor (min warm workers). Clamped to <= poolSize. */
  minPoolSize?: number
  /** How long a worker must be idle before it is eligible for scale-down retirement. */
  idleScaleDownMs?: number
  fastCrashThresholdMs?: number
  respawnBaseDelayMs?: number
  respawnMaxDelayMs?: number
  maxConsecutiveFastCrashes?: number
  recoveryIntervalMs?: number
}

interface WorkerMessage {
  type: 'event' | 'ready' | 'ack' | 'complete' | 'error' | 'log' | 'mem'
  taskId?: string
  event?: unknown
  error?: string
  level?: 'log' | 'info' | 'warn' | 'error' | 'debug'
  args?: unknown[]
  result?: unknown
  mem?: IsolateMemory
}

interface QueuedRequest {
  taskId: string
  event: unknown
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  queuedAt: number
  queueTimeout?: Timer | undefined
}

interface PoolStatistics {
  // Request counts
  requestsReceived: number
  requestsDispatched: number
  requestsQueued: number
  requestsAbandoned: number
  requestsCompleted: number
  requestsFailed: number
  requestsTimedOut: number

  // Current state
  currentQueueSize: number

  // Timing histograms (in milliseconds)
  queueTimes: number[]
  ackTimes: number[]
  processingTimes: number[]

  // Rates
  successRate: number
  timeoutRate: number
  abandonRate: number
}

interface TaskTiming {
  receivedAt: number
  queuedAt?: number
  dispatchedAt?: number
  ackedAt?: number
  completedAt?: number
}

// ============================================================================
// WORKER POOL MANAGER
// ============================================================================

export class WorkerPool {
  private readonly MAX_STATS_SIZE = 1000
  private workers: Map<number, WorkerInfo> = new Map()
  private roundRobinIndex = 0
  private nextWorkerId = 0
  private workerScript: string
  private expiryCheckInterval?: Timer | undefined
  private requestQueue: QueuedRequest[] = []
  private pendingTasks: Map<
    string,
    {
      resolve: (result: unknown) => void
      reject: (error: Error) => void
      ackTimer?: Timer | undefined
      taskTimer?: Timer | undefined
    }
  > = new Map()
  private taskTimings: Map<string, TaskTiming> = new Map()

  // Autoscaling: maintain `minPoolSize` warm workers, grow to `poolSize` (the max)
  // on demand, retire workers idle longer than `idleScaleDownMs` back down to the floor.
  private poolSize: number
  private minPoolSize: number
  private idleScaleDownMs: number
  // Crash-loop handling
  private fastCrashThresholdMs: number
  private respawnBaseDelayMs: number
  private respawnMaxDelayMs: number
  private maxConsecutiveFastCrashes: number
  private recoveryIntervalMs: number
  private consecutiveFastCrashes = 0
  private halted = false
  private haltLogged = false

  // Session high-water marks — the data that tells us how big the pool actually
  // needs to be. peakBusyWorkers is the most decision-relevant number: if a real
  // dev session never exceeds N concurrently-busy workers, the pool can be sized to N.
  private peakBusyWorkers = 0
  private peakQueueDepth = 0
  private respawnTimers: Set<Timer> = new Set()
  private recoveryTimer?: Timer | undefined
  private isShutdown = false

  // Statistics
  private stats = {
    requestsReceived: 0,
    requestsDispatched: 0,
    requestsQueued: 0,
    requestsAbandoned: 0,
    requestsCompleted: 0,
    requestsFailed: 0,
    requestsTimedOut: 0,
    queueTimes: [] as number[],
    ackTimes: [] as number[],
    processingTimes: [] as number[],
  }

  constructor(workerScript?: string, options: WorkerPoolOptions = {}) {
    this.workerScript = workerScript || path.join(process.cwd(), '.botpress/dist/index.cjs')
    // Ceiling is at least 1 — a poolSize of 0 (only reachable via an explicit option)
    // would otherwise dead-pool: createWorker()'s `size >= poolSize` guard blocks every spawn.
    this.poolSize = Math.max(1, options.poolSize ?? WORKER_POOL_SIZE)
    // Floor can never exceed the ceiling (and is at least 1 so the pool is never empty).
    this.minPoolSize = Math.max(1, Math.min(options.minPoolSize ?? MIN_WORKER_POOL_SIZE, this.poolSize))
    this.idleScaleDownMs = options.idleScaleDownMs ?? WORKER_IDLE_SCALE_DOWN_MS
    this.fastCrashThresholdMs = options.fastCrashThresholdMs ?? WORKER_FAST_CRASH_THRESHOLD_MS
    this.respawnBaseDelayMs = options.respawnBaseDelayMs ?? WORKER_RESPAWN_BASE_DELAY_MS
    this.respawnMaxDelayMs = options.respawnMaxDelayMs ?? WORKER_RESPAWN_MAX_DELAY_MS
    this.maxConsecutiveFastCrashes = options.maxConsecutiveFastCrashes ?? WORKER_MAX_CONSECUTIVE_FAST_CRASHES
    this.recoveryIntervalMs = options.recoveryIntervalMs ?? WORKER_POOL_RECOVERY_INTERVAL_MS

    debugLog('[WorkerPool] Initializing...', this.workerScript, process.cwd())
    this.initialize()
  }

  /**
   * Initialize the worker pool at its warm floor. Additional workers are spawned
   * on demand (up to poolSize) when concurrent load exceeds the current count.
   */
  private initialize(): void {
    debugLog(`[WorkerPool] Initializing pool with ${this.minPoolSize} warm workers (max ${this.poolSize})`)
    for (let i = 0; i < this.minPoolSize; i++) {
      this.createWorker()
    }

    // Start proactive expiry + idle scale-down sweep
    this.startExpiryCheck()
  }

  /**
   * Start proactive worker expiry checking
   */
  private startExpiryCheck(): void {
    this.expiryCheckInterval = setInterval(() => {
      this.checkWorkerExpiry()
    }, WORKER_EXPIRY_CHECK_INTERVAL_MS)

    debugLog(
      `[WorkerPool] Started expiry check (interval: ${WORKER_EXPIRY_CHECK_INTERVAL_MS}ms, threshold: ${WORKER_MIN_LIFETIME_MS}ms)`
    )
  }

  /**
   * Maintenance sweep (every WORKER_EXPIRY_CHECK_INTERVAL_MS): scales the pool down
   * toward its floor by retiring workers idle longer than idleScaleDownMs, and keeps
   * the floor fresh by replacing workers near their lifetime expiry. Only idle workers
   * are eligible, and the pool is never taken below minPoolSize.
   */
  private checkWorkerExpiry(): void {
    const now = Date.now()

    for (const [workerId, workerInfo] of this.workers.entries()) {
      // Skip workers that are busy or already terminated
      if (workerInfo.status !== 'idle') {
        continue
      }

      // Recomputed each iteration: retireWorker() shrinks the map, so this naturally
      // stops shedding once we reach the floor.
      const aboveFloor = this.workers.size > this.minPoolSize
      const idleFor = workerInfo.becameIdleAt !== undefined ? now - workerInfo.becameIdleAt : 0
      const expiringSoon = workerInfo.expiryTime - now <= WORKER_MIN_LIFETIME_MS

      if (aboveFloor && idleFor >= this.idleScaleDownMs) {
        // Scale down: shed an idle worker we no longer need (no replacement).
        debugLog(
          `[WorkerPool] Retiring idle worker ${workerId} (idle ${Math.floor(idleFor / 1000)}s, ` +
            `size ${this.workers.size} > floor ${this.minPoolSize})`
        )
        this.retireWorker(workerId)
      } else if (expiringSoon) {
        // Nearing its lifetime: above the floor just retire it (scale down); at the
        // floor replace it so the warm floor stays fresh.
        if (aboveFloor) {
          this.retireWorker(workerId)
        } else {
          debugLog(`[WorkerPool] Replacing floor worker ${workerId} nearing expiry`)
          this.replaceWorker(workerId)
        }
      }
    }
  }

  /**
   * Terminate an idle worker without replacing it (scale-down). Safe to call while
   * iterating this.workers — deleting the current key during Map iteration is allowed.
   */
  private retireWorker(workerId: number): void {
    const workerInfo = this.workers.get(workerId)
    if (!workerInfo) return

    workerInfo.status = 'terminated'
    if (workerInfo.stabilityTimer) {
      clearTimeout(workerInfo.stabilityTimer)
      workerInfo.stabilityTimer = undefined
    }
    this.workers.delete(workerId)
    workerInfo.worker.terminate().catch((err) => {
      logger.error(`[WorkerPool] Error terminating worker ${workerId}:`, err)
    })
  }

  /**
   * Create a new worker and add it to the pool.
   * Returns -1 without spawning when the pool is halted, full, or the script is missing.
   */
  private createWorker(): number {
    if (this.isShutdown || this.halted || this.workers.size >= this.poolSize) {
      // Every respawn path funnels through here, so a refused spawn is the
      // moment a halted pool can turn out to be empty — drain the queue then.
      this.failQueuedTasksWhileHalted()
      return -1
    }

    // Spawning a worker for a missing script costs a full V8 isolate before it fails.
    // Check up front so a deleted bundle (e.g. the project was rebuilt or removed
    // under a running dev session) counts as a fast crash without burning CPU.
    if (!existsSync(this.workerScript)) {
      this.noteFastCrash(new Error(`Worker script not found: ${this.workerScript}`))
      return -1
    }

    const workerId = this.nextWorkerId++
    const startTime = Date.now()
    const expiryTime = startTime + WORKER_LIFETIME_MS

    debugLog(`[WorkerPool] Creating worker ${workerId} (expires at ${new Date(expiryTime).toISOString()})`)

    const worker = new Worker(this.workerScript, {
      env: {
        ...process.env,
        IS_DEV_WORKER: 'true',
        WORKER_ID: workerId.toString(),
        WORKER_EXPIRY_TIME: expiryTime.toString(),
      },
      execArgv: ['--no-warnings'],
    })

    const workerInfo: WorkerInfo = {
      worker,
      status: 'starting',
      startTime,
      expiryTime,
    }

    // Once the worker proves stable, clear the fast-crash streak and top the pool
    // back up (replacements skipped while crashing/halted leave it under-sized)
    workerInfo.stabilityTimer = setTimeout(() => {
      workerInfo.stabilityTimer = undefined
      if (this.consecutiveFastCrashes > 0 || this.haltLogged) {
        debugLog(`[WorkerPool] Worker ${workerId} is stable, resetting crash-loop state`)
      }
      this.consecutiveFastCrashes = 0
      this.haltLogged = false
      this.refillPool()
    }, this.fastCrashThresholdMs)
    workerInfo.stabilityTimer.unref?.()

    this.workers.set(workerId, workerInfo)

    // Set up message handler
    worker.on('message', (message: WorkerMessage) => {
      this.handleWorkerMessage(workerId, message)
    })

    // Set up error handler
    worker.on('error', (error) => {
      logger.error(`[WorkerPool] Worker ${workerId} error:`, error)
      this.handleWorkerCrash(workerId, error)
    })

    // Set up exit handler
    worker.on('exit', (code) => {
      debugLog(`[WorkerPool] Worker ${workerId} exited with code ${code}`)
      const info = this.workers.get(workerId)
      if (info && info.status !== 'terminated') {
        // Unexpected exit - respawn
        debugLog(`[WorkerPool] Worker ${workerId} died unexpectedly, respawning...`)
        this.handleWorkerCrash(workerId)
      }
    })

    return workerId
  }

  /**
   * Top the pool back up to its configured size
   */
  private refillPool(): void {
    // Restore only the warm floor; capacity above the floor is spawned on demand
    // by executeTask() when concurrent load calls for it.
    while (!this.halted && !this.isShutdown && this.workers.size < this.minPoolSize) {
      if (this.createWorker() === -1) {
        break
      }
    }
  }

  /**
   * Record a fast crash (worker died right after spawn, or its script is missing).
   * Backs off exponentially and halts the pool after too many in a row.
   */
  private noteFastCrash(error?: Error): void {
    if (this.isShutdown) {
      return
    }
    if (this.halted) {
      // A straggler worker crashed after the halt — if it was the last one,
      // the queue can no longer be served.
      this.failQueuedTasksWhileHalted()
      return
    }

    this.consecutiveFastCrashes++

    if (this.consecutiveFastCrashes >= this.maxConsecutiveFastCrashes) {
      this.halted = true
      if (!this.haltLogged) {
        this.haltLogged = true
        logger.error(
          `[WorkerPool] Workers are failing to start repeatedly (${this.consecutiveFastCrashes} consecutive fast crashes` +
            `${error ? `, last error: ${error.message}` : ''}). ` +
            `Halting respawns to avoid a CPU storm. Check that "${this.workerScript}" exists and builds — ` +
            `a probe worker will retry every ${Math.round(this.recoveryIntervalMs / 1000)}s.`
        )
      }
      this.failQueuedTasksWhileHalted()
      this.scheduleRecovery()
      return
    }

    const delay = Math.min(this.respawnBaseDelayMs * 2 ** (this.consecutiveFastCrashes - 1), this.respawnMaxDelayMs)
    debugLog(
      `[WorkerPool] Fast crash ${this.consecutiveFastCrashes}/${this.maxConsecutiveFastCrashes}, respawning in ${delay}ms`
    )

    const timer = setTimeout(() => {
      this.respawnTimers.delete(timer)
      this.createWorker()
    }, delay)
    timer.unref?.()
    this.respawnTimers.add(timer)
  }

  private haltedErrorMessage(): string {
    return (
      `Worker pool is halted: workers crashed ${this.consecutiveFastCrashes} times in a row on startup. ` +
      `Check that "${this.workerScript}" exists and builds.`
    )
  }

  /**
   * With the pool halted and no workers left, queued tasks can never be served —
   * reject them now with the real reason instead of letting them sit until the
   * generic queue timeout fires 30s later.
   */
  private failQueuedTasksWhileHalted(): void {
    if (!this.halted || this.workers.size > 0 || this.requestQueue.length === 0) {
      return
    }

    const queued = this.requestQueue
    this.requestQueue = []
    for (const request of queued) {
      if (request.queueTimeout) {
        clearTimeout(request.queueTimeout)
      }
      this.taskTimings.delete(request.taskId)
      this.stats.requestsAbandoned++
      request.reject(new Error(this.haltedErrorMessage()))
    }
  }

  /**
   * While halted, periodically try a single probe worker. If it survives the
   * stability window, the pool refills itself; if it crashes again, the pool
   * re-halts after one attempt instead of storming.
   */
  private scheduleRecovery(): void {
    if (this.isShutdown || this.recoveryTimer) {
      return
    }

    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined
      if (this.isShutdown || !this.halted) {
        return
      }
      debugLog('[WorkerPool] Attempting recovery with a probe worker')
      this.halted = false
      // One failed probe puts the pool straight back into the halted state
      this.consecutiveFastCrashes = this.maxConsecutiveFastCrashes - 1
      if (this.createWorker() === -1 && this.halted) {
        // Probe failed synchronously (script still missing) — recovery was rescheduled by noteFastCrash
        return
      }
    }, this.recoveryIntervalMs)
    this.recoveryTimer.unref?.()
  }

  /**
   * Handle messages from workers
   */
  private handleWorkerMessage(workerId: number, message: WorkerMessage): void {
    const workerInfo = this.workers.get(workerId)
    if (!workerInfo) return

    switch (message.type) {
      case 'log':
        // Relay worker logs to parent console
        const taskPrefix = workerInfo.currentTaskId ? `[Task ${workerInfo.currentTaskId}]` : ''
        const prefix = `[Worker ${workerId}]${taskPrefix}`
        const level = message.level || 'log'
        const args = message.args || []

        switch (level) {
          case 'error':
            logger.error(prefix, ...args)
            break
          case 'warn':
            logger.warn(prefix, ...args)
            break
          case 'info':
            logger.info(prefix, ...args)
            break
          case 'debug':
            logger.debug(prefix, ...args)
            break
          case 'log':
            logger.info(prefix, ...args)
            break
          default:
            debugLog(prefix, ...args)
        }
        break

      case 'ready':
        // The worker has loaded the bot bundle, installed its message handler,
        // and completed agent runtime setup. Only now is it safe to dispatch work:
        // cold-start latency should count as queue time, not as an ack timeout.
        if (workerInfo.status === 'starting') {
          debugLog(`[WorkerPool] Worker ${workerId} is ready`)
          workerInfo.status = 'idle'
          workerInfo.becameIdleAt = Date.now()
          this.processQueue()
        }
        break

      case 'ack':
        // Worker acknowledged receipt of task
        debugLog(`[WorkerPool] Worker ${workerId} acknowledged task ${message.taskId}`)
        const pendingAck = this.pendingTasks.get(message.taskId!)
        if (pendingAck?.ackTimer) {
          clearTimeout(pendingAck.ackTimer)
          pendingAck.ackTimer = undefined
        }

        // Track ack time
        const timing = this.taskTimings.get(message.taskId!)
        if (timing && timing.dispatchedAt) {
          timing.ackedAt = Date.now()
          const ackTime = timing.ackedAt - timing.dispatchedAt
          this.stats.ackTimes.push(ackTime)
          if (this.stats.ackTimes.length > this.MAX_STATS_SIZE) this.stats.ackTimes.shift()
        }
        break

      case 'complete':
        // Worker completed task
        debugLog(`[WorkerPool] Worker ${workerId} completed task ${message.taskId}`)
        workerInfo.status = 'idle'
        workerInfo.currentTaskId = undefined
        workerInfo.becameIdleAt = Date.now()

        const pendingComplete = this.pendingTasks.get(message.taskId!)
        if (pendingComplete) {
          if (pendingComplete.taskTimer) clearTimeout(pendingComplete.taskTimer)
          if (pendingComplete.ackTimer) clearTimeout(pendingComplete.ackTimer)
          pendingComplete.resolve(message.result)
          this.pendingTasks.delete(message.taskId!)
        }

        // Track completion and processing time
        const completeTiming = this.taskTimings.get(message.taskId!)
        if (completeTiming) {
          completeTiming.completedAt = Date.now()
          if (completeTiming.dispatchedAt) {
            const processingTime = completeTiming.completedAt - completeTiming.dispatchedAt
            this.stats.processingTimes.push(processingTime)
            if (this.stats.processingTimes.length > this.MAX_STATS_SIZE) this.stats.processingTimes.shift()
          }
          this.taskTimings.delete(message.taskId!)
        }
        this.stats.requestsCompleted++

        // Process next queued request if available
        this.processQueue()
        break

      case 'mem':
        // Periodic per-isolate memory self-report (dev telemetry only)
        if (message.mem) {
          workerInfo.lastMem = message.mem
        }
        break

      case 'error':
        // Worker encountered error
        logger.error(`[WorkerPool] Worker ${workerId} error on task ${message.taskId}:`, message.error)
        workerInfo.status = 'idle'
        workerInfo.currentTaskId = undefined
        workerInfo.becameIdleAt = Date.now()

        const pendingError = this.pendingTasks.get(message.taskId!)
        if (pendingError) {
          if (pendingError.taskTimer) clearTimeout(pendingError.taskTimer)
          if (pendingError.ackTimer) clearTimeout(pendingError.ackTimer)
          const rejectionError = new Error(message.error || 'Worker task failed')
          pendingError.reject(rejectionError)
          this.pendingTasks.delete(message.taskId!)
        }

        // Track failure
        this.taskTimings.delete(message.taskId!)
        this.stats.requestsFailed++

        // Process next queued request if available
        this.processQueue()
        break
    }
  }

  /**
   * Handle worker crash or unexpected termination
   */
  private handleWorkerCrash(workerId: number, error?: Error): void {
    const workerInfo = this.workers.get(workerId)
    if (!workerInfo) return

    // Mark worker as terminated
    workerInfo.status = 'terminated'
    if (workerInfo.stabilityTimer) {
      clearTimeout(workerInfo.stabilityTimer)
      workerInfo.stabilityTimer = undefined
    }

    // Reject any pending task
    if (workerInfo.currentTaskId) {
      const pending = this.pendingTasks.get(workerInfo.currentTaskId)
      if (pending) {
        if (pending.taskTimer) clearTimeout(pending.taskTimer)
        if (pending.ackTimer) clearTimeout(pending.ackTimer)
        pending.reject(error || new Error('Worker crashed'))
        this.pendingTasks.delete(workerInfo.currentTaskId)
      }
    }

    // Remove from pool
    this.workers.delete(workerId)

    // A worker dying right after spawn means its script is missing or broken —
    // respawning immediately in that state turns into a CPU storm (10 isolates
    // parsing a multi-MB bundle in a tight loop). Back off instead.
    const lifetime = Date.now() - workerInfo.startTime
    if (lifetime < this.fastCrashThresholdMs) {
      this.noteFastCrash(error)
      return
    }

    // Create replacement worker
    debugLog(`[WorkerPool] Spawning replacement worker for ${workerId}`)
    this.createWorker()
  }

  /**
   * Get next available worker using round-robin strategy
   */
  private getNextAvailableWorker(): {
    workerId: number
    workerInfo: WorkerInfo
  } | null {
    const workerArray = Array.from(this.workers.entries())
    if (workerArray.length === 0) return null

    // Try to find an idle worker starting from roundRobinIndex
    let attempts = 0
    while (attempts < workerArray.length) {
      const index = this.roundRobinIndex % workerArray.length
      this.roundRobinIndex++

      const entry = workerArray[index]
      if (!entry) {
        attempts++
        continue
      }

      const [workerId, workerInfo] = entry

      if (workerInfo.status === 'idle') {
        // Check if worker is about to expire
        const timeRemaining = workerInfo.expiryTime - Date.now()

        if (timeRemaining < WORKER_MIN_LIFETIME_MS) {
          debugLog(`[WorkerPool] Worker ${workerId} has ${timeRemaining}ms remaining, replacing...`)
          this.replaceWorker(workerId)
          attempts++
          continue
        }

        return { workerId, workerInfo }
      }

      attempts++
    }

    return null // All workers busy
  }

  /**
   * Replace a worker with a new one
   */
  private replaceWorker(workerId: number): void {
    const workerInfo = this.workers.get(workerId)
    if (!workerInfo) return

    debugLog(`[WorkerPool] Replacing worker ${workerId}`)

    // Mark as terminated and remove from pool
    workerInfo.status = 'terminated'
    if (workerInfo.stabilityTimer) {
      clearTimeout(workerInfo.stabilityTimer)
      workerInfo.stabilityTimer = undefined
    }
    this.workers.delete(workerId)

    // Terminate the worker
    workerInfo.worker.terminate().catch((err) => {
      logger.error(`[WorkerPool] Error terminating worker ${workerId}:`, err)
    })

    // Create replacement
    this.createWorker()
  }

  /**
   * Process queued requests when workers become available
   */
  private processQueue(): void {
    if (this.requestQueue.length === 0) {
      return
    }

    const available = this.getNextAvailableWorker()
    if (!available) {
      return // No workers available yet
    }

    // Dequeue and dispatch
    const queued = this.requestQueue.shift()
    if (!queued) return

    // Clear queue timeout
    if (queued.queueTimeout) {
      clearTimeout(queued.queueTimeout)
    }

    // Track queue time
    const queueTime = Date.now() - queued.queuedAt
    this.stats.queueTimes.push(queueTime)
    if (this.stats.queueTimes.length > this.MAX_STATS_SIZE) this.stats.queueTimes.shift()

    debugLog(
      `[WorkerPool] Dequeued task ${queued.taskId} (waited ${queueTime}ms, ${this.requestQueue.length} remaining in queue)`
    )

    // Dispatch to worker
    this.dispatchToWorker(
      available.workerId,
      available.workerInfo,
      queued.taskId,
      queued.event,
      queued.resolve,
      queued.reject
    )
  }

  /**
   * Dispatch a task to a specific worker
   */
  private dispatchToWorker(
    workerId: number,
    workerInfo: WorkerInfo,
    taskId: string,
    event: unknown,
    resolve: (result: unknown) => void,
    reject: (error: Error) => void
  ): void {
    debugLog(`[WorkerPool] Assigning task ${taskId} to worker ${workerId}`)

    // Update timing
    const timing = this.taskTimings.get(taskId)
    if (timing) {
      timing.dispatchedAt = Date.now()
    }

    // Mark worker as busy
    workerInfo.status = 'busy'
    workerInfo.currentTaskId = taskId
    workerInfo.becameIdleAt = undefined

    // Update statistics
    this.stats.requestsDispatched++
    this.recordConcurrencyPeak()

    // Set up acknowledgment timeout
    const ackTimer = setTimeout(() => {
      // Already resolved/cleaned up (the timer should have been cleared) — don't mutate stale state.
      if (!this.pendingTasks.has(taskId)) return
      logger.error(`[WorkerPool] Worker ${workerId} failed to acknowledge task ${taskId}`)
      workerInfo.status = 'idle'
      workerInfo.currentTaskId = undefined
      workerInfo.becameIdleAt = Date.now()
      this.pendingTasks.delete(taskId)
      this.taskTimings.delete(taskId)
      this.stats.requestsTimedOut++
      reject(new Error('Worker failed to acknowledge task'))
    }, WORKER_ACK_TIMEOUT_MS)

    // Set up task completion timeout
    const taskTimeoutMs = getConfiguredDevRequestTimeoutMs()
    const taskTimer = setTimeout(() => {
      // Already resolved/cleaned up (the timer should have been cleared) — don't mutate stale state.
      if (!this.pendingTasks.has(taskId)) return
      logger.error(`[WorkerPool] Worker ${workerId} task ${taskId} timed out`)
      workerInfo.status = 'idle'
      workerInfo.currentTaskId = undefined
      workerInfo.becameIdleAt = Date.now()
      this.pendingTasks.delete(taskId)
      this.taskTimings.delete(taskId)
      this.stats.requestsTimedOut++
      reject(new Error('Worker task timed out'))
    }, taskTimeoutMs)

    // Store pending task
    this.pendingTasks.set(taskId, {
      resolve,
      reject,
      ackTimer,
      taskTimer,
    })

    // Send task to worker
    const message: WorkerMessage = {
      type: 'event',
      taskId,
      event,
    }

    workerInfo.worker.postMessage(message)
  }

  /**
   * Execute a task on an available worker or queue it
   */
  public async executeTask(event: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      // With the pool halted and empty there is nothing to queue for — fail fast
      // with the real reason instead of a generic queue timeout 30s later.
      if (this.halted && this.workers.size === 0) {
        reject(new Error(this.haltedErrorMessage()))
        return
      }

      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

      // Track timing
      const timing: TaskTiming = {
        receivedAt: Date.now(),
      }
      this.taskTimings.set(taskId, timing)
      this.stats.requestsReceived++

      // Try to find available worker
      const available = this.getNextAvailableWorker()

      if (available) {
        // Dispatch immediately
        this.dispatchToWorker(available.workerId, available.workerInfo, taskId, event, resolve, reject)
      } else {
        // Queue the request
        debugLog(`[WorkerPool] All workers busy, queueing task ${taskId} (queue size: ${this.requestQueue.length})`)

        timing.queuedAt = Date.now()
        this.stats.requestsQueued++

        // Set up queue timeout
        const queueTimeout = setTimeout(() => {
          // Remove from queue
          const index = this.requestQueue.findIndex((r) => r.taskId === taskId)
          if (index !== -1) {
            this.requestQueue.splice(index, 1)
          }

          this.taskTimings.delete(taskId)
          this.stats.requestsAbandoned++

          logger.error(`[WorkerPool] Task ${taskId} abandoned after ${QUEUE_TIMEOUT_MS}ms in queue`)
          reject(new Error(`Request timed out in queue after ${QUEUE_TIMEOUT_MS}ms`))
        }, QUEUE_TIMEOUT_MS)

        this.requestQueue.push({
          taskId,
          event,
          resolve,
          reject,
          queuedAt: Date.now(),
          queueTimeout,
        })
        if (this.requestQueue.length > this.peakQueueDepth) {
          this.peakQueueDepth = this.requestQueue.length
        }

        // Autoscale up: every worker is busy and we are below the ceiling, so add one.
        // createWorker() registers it idle and calls processQueue(), which drains this
        // freshly-queued task to it once its bundle loads (~300ms) — unless an existing
        // worker frees first and grabs it. Capped at poolSize by createWorker()'s guard.
        if (!this.halted && !this.isShutdown && this.workers.size < this.poolSize) {
          debugLog(`[WorkerPool] All ${this.workers.size} workers busy — scaling up toward max ${this.poolSize}`)
          this.createWorker()
        }
      }
    })
  }

  /**
   * Shutdown the worker pool
   */
  public async shutdown(): Promise<void> {
    debugLog(`[WorkerPool] Shutting down pool...`)
    this.isShutdown = true

    // Stop expiry check
    if (this.expiryCheckInterval) {
      clearInterval(this.expiryCheckInterval)
      this.expiryCheckInterval = undefined
    }

    // Stop crash-loop timers
    for (const timer of this.respawnTimers) {
      clearTimeout(timer)
    }
    this.respawnTimers.clear()
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer)
      this.recoveryTimer = undefined
    }
    for (const info of this.workers.values()) {
      if (info.stabilityTimer) {
        clearTimeout(info.stabilityTimer)
        info.stabilityTimer = undefined
      }
    }

    // Clear queued requests
    for (const queued of this.requestQueue) {
      if (queued.queueTimeout) {
        clearTimeout(queued.queueTimeout)
      }
      queued.reject(new Error('Worker pool shutting down'))
    }
    this.requestQueue = []

    const terminationPromises = Array.from(this.workers.entries()).map(([workerId, info]) => {
      debugLog(`[WorkerPool] Terminating worker ${workerId}`)
      info.status = 'terminated'
      return info.worker.terminate()
    })

    await Promise.all(terminationPromises)
    this.workers.clear()
    this.pendingTasks.clear()
    this.taskTimings.clear()

    debugLog(`[WorkerPool] Pool shutdown complete`)
  }

  /**
   * Get basic pool statistics (worker status)
   */
  public getWorkerStats(): {
    total: number
    starting: number
    idle: number
    busy: number
    terminated: number
  } {
    const stats = {
      total: this.workers.size,
      starting: 0,
      idle: 0,
      busy: 0,
      terminated: 0,
    }

    for (const info of this.workers.values()) {
      stats[info.status]++
    }

    return stats
  }

  /**
   * Update the busy-worker high-water mark. Called whenever a worker is dispatched
   * a task, so peakBusyWorkers reflects the most workers ever simultaneously busy.
   */
  private recordConcurrencyPeak(): void {
    let busy = 0
    for (const info of this.workers.values()) {
      if (info.status === 'busy') busy++
    }
    if (busy > this.peakBusyWorkers) {
      this.peakBusyWorkers = busy
    }
  }

  /**
   * Memory + concurrency telemetry for sizing the pool. The main thread owns the
   * pool, so process.memoryUsage() here reports the whole bp-dev process (rss is
   * process-wide); per-worker entries carry each isolate's self-reported V8 heap.
   * peakBusyWorkers / peakQueueDepth are session high-water marks.
   */
  public getMemoryStats(): {
    poolSize: number
    minWorkers: number
    peakBusyWorkers: number
    peakQueueDepth: number
    mainThread: { rss: number; heapUsed: number; heapTotal: number; external: number; arrayBuffers: number }
    workers: Array<{ id: number; status: WorkerStatus; mem?: IsolateMemory }>
  } {
    const workers: Array<{ id: number; status: WorkerStatus; mem?: IsolateMemory }> = []
    for (const [id, info] of this.workers.entries()) {
      workers.push(info.lastMem ? { id, status: info.status, mem: info.lastMem } : { id, status: info.status })
    }
    const m = process.memoryUsage()
    return {
      poolSize: this.poolSize,
      minWorkers: this.minPoolSize,
      peakBusyWorkers: this.peakBusyWorkers,
      peakQueueDepth: this.peakQueueDepth,
      mainThread: {
        rss: m.rss,
        heapUsed: m.heapUsed,
        heapTotal: m.heapTotal,
        external: m.external,
        arrayBuffers: m.arrayBuffers,
      },
      workers,
    }
  }

  /**
   * Get comprehensive pool statistics with histograms
   */
  public getStats(): PoolStatistics {
    const totalRequests = this.stats.requestsReceived

    // Calculate rates
    const successRate = totalRequests > 0 ? this.stats.requestsCompleted / totalRequests : 0
    const timeoutRate = totalRequests > 0 ? this.stats.requestsTimedOut / totalRequests : 0
    const abandonRate = totalRequests > 0 ? this.stats.requestsAbandoned / totalRequests : 0

    return {
      requestsReceived: this.stats.requestsReceived,
      requestsDispatched: this.stats.requestsDispatched,
      requestsQueued: this.stats.requestsQueued,
      requestsAbandoned: this.stats.requestsAbandoned,
      requestsCompleted: this.stats.requestsCompleted,
      requestsFailed: this.stats.requestsFailed,
      requestsTimedOut: this.stats.requestsTimedOut,
      currentQueueSize: this.requestQueue.length,
      queueTimes: [...this.stats.queueTimes],
      ackTimes: [...this.stats.ackTimes],
      processingTimes: [...this.stats.processingTimes],
      successRate,
      timeoutRate,
      abandonRate,
    }
  }

  /**
   * Get statistics summary with percentiles
   */
  public getStatsSummary(): string {
    const stats = this.getStats()
    const workerStats = this.getWorkerStats()
    const memStats = this.getMemoryStats()
    const mb = (bytes: number): string => `${Math.round(bytes / 1048576)} MB`

    const percentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0
      const sorted = [...arr].sort((a, b) => a - b)
      const index = Math.ceil((sorted.length * p) / 100) - 1
      return sorted[Math.max(0, index)] || 0
    }

    const avg = (arr: number[]): number => {
      if (arr.length === 0) return 0
      return arr.reduce((sum, val) => sum + val, 0) / arr.length
    }

    const lines = [
      '='.repeat(60),
      'WORKER POOL STATISTICS',
      '='.repeat(60),
      '',
      'Workers:',
      `  Total: ${workerStats.total} (autoscale ${memStats.minWorkers}..${memStats.poolSize})`,
      `  Starting: ${workerStats.starting}`,
      `  Idle: ${workerStats.idle}`,
      `  Busy: ${workerStats.busy}`,
      '',
      'Concurrency (session peaks — use these to size the pool):',
      `  Peak busy workers: ${memStats.peakBusyWorkers}`,
      `  Peak queue depth: ${memStats.peakQueueDepth}`,
      '',
      'Memory:',
      `  Process RSS (whole brt dev): ${mb(memStats.mainThread.rss)}`,
      `  Main-thread isolate heap: ${mb(memStats.mainThread.heapUsed)} / ${mb(memStats.mainThread.heapTotal)}`,
      `  Per-worker isolate heap (heapTotal): ${
        memStats.workers
          .filter((w) => w.mem)
          .map((w) => `#${w.id}=${mb(w.mem!.heapTotal)}`)
          .join(', ') || '(awaiting first report)'
      }`,
      '',
      'Requests:',
      `  Received: ${stats.requestsReceived}`,
      `  Dispatched: ${stats.requestsDispatched}`,
      `  Queued: ${stats.requestsQueued}`,
      `  Completed: ${stats.requestsCompleted}`,
      `  Failed: ${stats.requestsFailed}`,
      `  Timed Out: ${stats.requestsTimedOut}`,
      `  Abandoned: ${stats.requestsAbandoned}`,
      `  Current Queue Size: ${stats.currentQueueSize}`,
      '',
      'Rates:',
      `  Success Rate: ${(stats.successRate * 100).toFixed(2)}%`,
      `  Timeout Rate: ${(stats.timeoutRate * 100).toFixed(2)}%`,
      `  Abandon Rate: ${(stats.abandonRate * 100).toFixed(2)}%`,
      '',
      'Queue Time (ms):',
      `  Count: ${stats.queueTimes.length}`,
      `  Avg: ${avg(stats.queueTimes).toFixed(2)}`,
      `  P50: ${percentile(stats.queueTimes, 50)}`,
      `  P95: ${percentile(stats.queueTimes, 95)}`,
      `  P99: ${percentile(stats.queueTimes, 99)}`,
      '',
      'Ack Time (ms):',
      `  Count: ${stats.ackTimes.length}`,
      `  Avg: ${avg(stats.ackTimes).toFixed(2)}`,
      `  P50: ${percentile(stats.ackTimes, 50)}`,
      `  P95: ${percentile(stats.ackTimes, 95)}`,
      `  P99: ${percentile(stats.ackTimes, 99)}`,
      '',
      'Processing Time (ms):',
      `  Count: ${stats.processingTimes.length}`,
      `  Avg: ${avg(stats.processingTimes).toFixed(2)}`,
      `  P50: ${percentile(stats.processingTimes, 50)}`,
      `  P95: ${percentile(stats.processingTimes, 95)}`,
      `  P99: ${percentile(stats.processingTimes, 99)}`,
      '='.repeat(60),
    ]

    return lines.join('\n')
  }
}
