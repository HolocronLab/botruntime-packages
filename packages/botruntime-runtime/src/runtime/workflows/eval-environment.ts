export type EvalExecutionEnvironment = {
  apiUrl: string
  token: string
  runtimeBotId: string
  apiBotId: string
  workspaceId?: string
  development: boolean
}

export function resolveEvalExecutionEnvironment(
  env: NodeJS.ProcessEnv,
  runtimeBotId: string,
): EvalExecutionEnvironment {
  const apiUrl = env.BP_API_URL || env.ADK_API_URL
  const token = env.BP_TOKEN || env.ADK_TOKEN

  if (!apiUrl)
    throw new Error('BP_API_URL or ADK_API_URL is required to run evals')
  if (!token) throw new Error('A runtime token is required to run evals')
  if (!runtimeBotId)
    throw new Error('A runtime bot id is required to execute evals')

  const development = env.NODE_ENV === 'development'
  const targetBotId = env.BP_TARGET_BOT_ID || env.ADK_TARGET_BOT_ID
  const workspaceId = env.BP_WORKSPACE_ID || env.ADK_WORKSPACE_ID
  if (development && !targetBotId)
    throw new Error('A target bot id is required to execute development evals')
  if (development && !/^[1-9][0-9]*$/.test(targetBotId!))
    throw new Error('Development target bot id must be numeric')
  if (development && !workspaceId)
    throw new Error('A workspace id is required to execute development evals')

  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    token,
    runtimeBotId,
    apiBotId: development ? targetBotId! : runtimeBotId,
    ...(development ? { workspaceId } : {}),
    development,
  }
}
