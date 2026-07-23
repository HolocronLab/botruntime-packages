/**
 * Runtime callbacks carry the opaque tunnel id for routing, while state,
 * workflows, files, and other bot data belong to the numeric API target. BRT
 * supplies that target only for development workers. Production keeps the
 * callback bot identity and its normal optional workspace coordinate.
 */
export function runtimeClientCoordinates(
  env: NodeJS.ProcessEnv,
  callbackBotId: string,
): { botId: string; workspaceId: string | undefined } {
  const targetBotId = env.BP_TARGET_BOT_ID || env.ADK_TARGET_BOT_ID
  const workspaceId = env.BP_WORKSPACE_ID || env.ADK_WORKSPACE_ID || undefined

  if (targetBotId) {
    if (!/^[1-9][0-9]*$/.test(targetBotId)) {
      throw new Error('Development target bot id must be numeric')
    }
    if (!workspaceId) {
      throw new Error('Development workspace id is required')
    }
    return { botId: targetBotId, workspaceId }
  }

  return { botId: callbackBotId, workspaceId }
}

export const RUNTIME_ACTION_TIMEOUT_SAFETY_MARGIN_MS = 5_000

/**
 * Returns the relative action-response budget that is still available inside
 * the current invocation. Keeping this relative avoids cross-host wall-clock
 * assumptions; the client transport applies its own independent timeout cap.
 */
export function runtimeActionTimeoutMs(remainingExecutionTimeMs: number): number {
  if (!Number.isFinite(remainingExecutionTimeMs)) {
    return 0
  }
  return Math.max(
    Math.floor(remainingExecutionTimeMs) - RUNTIME_ACTION_TIMEOUT_SAFETY_MARGIN_MS,
    0,
  )
}
