import { context } from './context'
import { getSingleton } from '../singletons'

export class PromiseTracker {
  private promises: Set<Promise<unknown>> = new Set()
  private isShuttingDown = false

  reset() {
    this.promises.clear()
    this.isShuttingDown = false
  }

  /**
   * Register a promise to be tracked
   */
  register<T>(promise: Promise<T>): Promise<T> {
    if (this.isShuttingDown) {
      console.warn('Cannot register new promises during shutdown')
      return promise
    }

    this.promises.add(promise)

    // Remove the promise from tracking when it settles
    promise.finally(() => {
      this.promises.delete(promise)
    })

    return promise
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true
    await this.awaitAll()
  }

  /**
   * Wait for all registered promises to settle
   */
  async awaitAll(): Promise<PromiseSettledResult<unknown>[]> {
    let copyOfPromises = [...this.promises]

    // Clear the set after all promises have settled
    this.promises.clear()

    const results = await Promise.allSettled(copyOfPromises)

    return results
  }

  /**
   * Get the number of currently tracked promises
   */
  get count(): number {
    return this.promises.size
  }

  /**
   * Check if there are any pending promises
   */
  get hasPending(): boolean {
    return this.promises.size > 0
  }

  /**
   * Get a snapshot of currently tracked promises
   */
  getSnapshot(): Promise<unknown>[] {
    return Array.from(this.promises)
  }
}

const getPromiseTracker = () => {
  const tracker = context.get('promiseTracker')
  if (tracker) {
    return tracker
  }

  throw new Error('PromiseTracker not found in context. Make sure to initialize it in your runtime setup.')
}

/**
 * Convenience function to register a promise with the context's PromiseTracker
 */
export function trackPromise<T>(promise: Promise<T>): Promise<T> {
  return getPromiseTracker().register(promise)
}

/**
 * Await all tracked promises to settle
 *
 */
export async function shutdownPromiseTracker(): Promise<void> {
  return getPromiseTracker().shutdown()
}

/**
 * The well-known `globalThis` key under which the background-promise registrar
 * is installed. Plugins and other bot handlers that cannot import
 * `@holocronlab/botruntime-runtime` reach the registrar through this key — see
 * {@link registerBackgroundPromise} and {@link installGlobalBackgroundRegistrar}.
 */
export const BACKGROUND_PROMISE_GLOBAL_KEY = '__ADK_GLOBAL_BACKGROUND' as const

/**
 * Signature of the globally-installed background-promise registrar.
 *
 * Hand a promise to this function to have it awaited before the lambda is torn
 * down, without blocking the current handler. Returns the same promise so it can
 * be chained. Always safe to call: if there is no active request context (e.g.
 * cold-start top-level code, scripts, workers without a context), the promise is
 * left to run detached and returned unchanged — it is never re-thrown and the
 * call never throws.
 */
export type BackgroundPromiseRegistrar = <T>(promise: Promise<T>) => Promise<T>

/**
 * Register a promise to be awaited before the lambda is killed.
 *
 * This is the in-runtime entry point. It bridges to the *current request's*
 * {@link PromiseTracker} (resolved from the AsyncLocalStorage context), so a
 * promise handed off here is flushed by `shutdownPromiseTracker()` at the end of
 * the request — the same machinery `trackPromise` uses.
 *
 * Unlike `trackPromise`, this never throws when no context is active: it falls
 * back to letting the promise run detached. That makes it safe to expose to
 * untrusted plugin code, which may run in contexts we do not control.
 */
export function registerBackgroundPromise<T>(promise: Promise<T>): Promise<T> {
  // Guard against non-promise input — plugins may hand us a plain value or the
  // result of an `fn()` that returned undefined. `Promise.resolve` adopts a real
  // promise as-is and wraps anything else, so the tracker and the detached
  // `.catch` below always operate on a genuine promise.
  const p = Promise.resolve(promise)

  // Resolve the per-request tracker defensively — plugins may call us from
  // anywhere, including outside an active request context.
  const tracker = context.get('promiseTracker', { optional: true })

  if (!tracker) {
    // No active request: nothing owns a flush, so run detached. Swallow the
    // rejection here so an unhandled rejection doesn't crash the process — the
    // caller still gets the (normalized) promise to handle as it sees fit.
    void p.catch(() => {})
    return p
  }

  return tracker.register(p)
}

/**
 * Install {@link registerBackgroundPromise} onto `globalThis` under
 * {@link BACKGROUND_PROMISE_GLOBAL_KEY} so code that cannot import
 * `@holocronlab/botruntime-runtime` (plugins, generated handlers) can hand off background
 * promises.
 *
 * Idempotent and bundle-safe: the function is stored via `getSingleton`, so
 * multiple loaded copies of the runtime share one registrar bound to the single
 * shared AsyncLocalStorage. Runs at module load (see bottom of this file) — well
 * before any request handler or plugin executes.
 */
export function installGlobalBackgroundRegistrar(): BackgroundPromiseRegistrar {
  const registrar = getSingleton<BackgroundPromiseRegistrar>(
    BACKGROUND_PROMISE_GLOBAL_KEY,
    () => registerBackgroundPromise
  )
  return registrar
}

// Install on module load so the global is present before any handler/plugin runs.
installGlobalBackgroundRegistrar()
