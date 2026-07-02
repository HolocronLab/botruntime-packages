export type Agent0RuntimePermissionAction = 'ask' | 'allow' | 'deny'

export type Agent0OpenCodePermissionConfig = Record<
  string,
  Agent0RuntimePermissionAction | Record<string, Agent0RuntimePermissionAction>
>

export const AGENT0_BUILT_IN_MCP_PERMISSION = 'adk_*'
export const AGENT0_HIDDEN_OPENCODE_SKILL = 'customize-opencode'

const AGENT0_OPEN_CODE_PERMISSION_POLICY = Object.freeze({
  question: 'allow',
  read: 'allow',
  list: 'allow',
  glob: 'allow',
  grep: 'allow',
  edit: 'allow',
  bash: 'allow',
  todowrite: 'allow',
  task: 'allow',
  webfetch: 'allow',
  websearch: 'allow',
  skill: {
    '*': 'allow',
    [AGENT0_HIDDEN_OPENCODE_SKILL]: 'deny',
  },
  lsp: 'allow',
  external_directory: 'deny',
  repo_clone: 'deny',
  repo_overview: 'allow',
  [AGENT0_BUILT_IN_MCP_PERMISSION]: 'allow',
} satisfies Agent0OpenCodePermissionConfig)

export function buildAgent0OpenCodePermissionConfig(): Agent0OpenCodePermissionConfig {
  return Object.fromEntries(
    Object.entries(AGENT0_OPEN_CODE_PERMISSION_POLICY).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : { ...value },
    ])
  )
}
