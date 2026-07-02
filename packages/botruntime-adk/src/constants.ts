/**
 * Default Botpress API URL
 * Used when agent.json doesn't specify an apiUrl (for backwards compatibility)
 */
export const DEFAULT_API_URL = 'https://api.botpress.cloud'

/**
 * Built-in interfaces that are always included in ADK projects
 * These are constants and cannot be modified by users
 */
export const BUILTIN_INTERFACES = {
  'typing-indicator': 'typing-indicator@0.0.3',
  llm: 'llm@9.0.0',
  listable: 'listable@0.0.2',
} as const

export const MAX_TABLE_COLUMNS = 20
