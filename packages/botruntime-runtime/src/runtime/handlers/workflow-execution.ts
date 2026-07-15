export type WorkflowYieldOptions<T> = {
  abortAfterMs: number
  cleanupGraceMs: number
  continuation: T
  onAbort?: () => void
}

/**
 * Abort a workflow when its execution budget is nearly exhausted, then keep
 * the request alive for a short cleanup window. Signal-aware handlers can use
 * that window to persist a terminal verdict; handlers that do not settle still
 * yield safely for a later continuation.
 */
export function executeWorkflowWithYieldGrace<T>(
  action: (signal: AbortSignal) => Promise<T>,
  options: WorkflowYieldOptions<T>
): Promise<T> {
  const abortController = new AbortController()

  return new Promise<T>((resolve, reject) => {
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    const abortTimer = setTimeout(() => {
      options.onAbort?.()
      abortController.abort()
      cleanupTimer = setTimeout(() => resolve(options.continuation), options.cleanupGraceMs)
    }, options.abortAfterMs)

    Promise.resolve()
      .then(() => action(abortController.signal))
      .then(
        (result) => {
          clearTimeout(abortTimer)
          if (cleanupTimer) clearTimeout(cleanupTimer)
          resolve(result)
        },
        (error: unknown) => {
          clearTimeout(abortTimer)
          if (cleanupTimer) clearTimeout(cleanupTimer)
          reject(error)
        }
      )
  })
}
