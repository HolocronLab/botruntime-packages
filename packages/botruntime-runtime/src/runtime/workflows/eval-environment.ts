export type EvalExecutionEnvironment = {
  apiUrl: string
  token: string
  runtimeBotId: string
  development: boolean
}

export function resolveEvalExecutionEnvironment(
  env: NodeJS.ProcessEnv,
  runtimeBotId: string
): EvalExecutionEnvironment {
  const apiUrl = env.BP_API_URL || env.ADK_API_URL
  const token = env.BP_TOKEN || env.ADK_TOKEN

  if (!apiUrl) throw new Error('BP_API_URL or ADK_API_URL is required to run evals')
  if (!token) throw new Error('A runtime token is required to run evals')
  if (!runtimeBotId) throw new Error('A runtime bot id is required to execute evals')

  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    token,
    runtimeBotId,
    development: env.NODE_ENV === 'development',
  }
}
