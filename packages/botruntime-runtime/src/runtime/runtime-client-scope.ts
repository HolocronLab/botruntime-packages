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
