/**
 * Development callbacks are routed by the opaque runtime bot id and the PAT
 * account membership. A workspace header switches server auth to the numeric
 * deploy path, so it must be explicitly suppressed instead of omitted (the
 * client otherwise fills an omitted value from BP_WORKSPACE_ID).
 */
export function runtimeClientWorkspaceId(env: NodeJS.ProcessEnv): string | undefined {
  if (env.NODE_ENV === 'development') return ''
  return env.BP_WORKSPACE_ID || env.ADK_WORKSPACE_ID || undefined
}
