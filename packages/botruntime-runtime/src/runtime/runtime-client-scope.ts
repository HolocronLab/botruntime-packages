/**
 * Development callbacks are routed by an opaque runtime bot id and PAT account
 * membership. A workspace header switches server auth to the positive-decimal
 * deploy path, so it must be explicitly suppressed instead of omitted (the
 * client otherwise fills an omitted value from BP_WORKSPACE_ID).
 *
 * Classic tunnel execution does not define NODE_ENV, therefore the bot identity
 * is the authoritative discriminator: deployed platform bot ids are positive
 * decimals, while dev runtime ids are deliberately opaque.
 */
export function runtimeClientWorkspaceId(env: NodeJS.ProcessEnv, botId: string): string | undefined {
  if (!/^[1-9][0-9]*$/.test(botId)) return ''
  return env.BP_WORKSPACE_ID || env.ADK_WORKSPACE_ID || undefined
}
