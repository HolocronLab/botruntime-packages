import fs from 'fs/promises'
import path from 'path'
import { type AgentInfo, type AgentLocalInfo, agentInfoSchema, agentLocalInfoSchema } from './types.js'
import { ValidationErrors } from './validation-errors.js'
import { DEFAULT_API_URL } from '../constants.js'

export interface ResolveAgentOptions {
  /**
   * If true, throws an error if agent.json is missing or invalid.
   * If false, returns null when agent.json is not found.
   */
  required?: boolean
  /**
   * If true, validates that workspaceId exists in agent.json
   */
  requireWorkspace?: boolean
  /**
   * If true, validates that botId exists in agent.json
   */
  requireBot?: boolean
}

/**
 * Try to read and parse agent.local.json, returning the validated data or null.
 */
export async function readAgentLocalInfo(agentPath: string): Promise<AgentLocalInfo | null> {
  const localPath = path.join(agentPath, 'agent.local.json')
  try {
    const localContent = await fs.readFile(localPath, 'utf-8')
    const localData = JSON.parse(localContent)
    const localResult = agentLocalInfoSchema.safeParse(localData)
    if (!localResult.success) {
      const issue = localResult.error.errors[0]
      throw ValidationErrors.warning(
        `agent.local.json has an invalid field: ${issue?.path.join('.')} — ${issue?.message}`,
        'agent.local.json'
      )
    }
    return localResult.data
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    if (ValidationErrors.isValidationError(error)) {
      throw error
    }
    throw ValidationErrors.warning(`Failed to read agent.local.json: ${(error as Error).message}`, 'agent.local.json')
  }
}

/**
 * Read only the shared production link. Local overrides are deliberately not
 * consulted so command boundaries can derive a prod identity without mixing
 * environments before they establish their credential authority.
 */
export async function readAgentInfo(agentPath: string): Promise<AgentInfo | null> {
  const agentJsonPath = path.join(agentPath, 'agent.json')
  try {
    const agentJsonContent = await fs.readFile(agentJsonPath, 'utf-8')

    let agentData: unknown
    try {
      agentData = JSON.parse(agentJsonContent)
    } catch (parseError) {
      throw ValidationErrors.invalidConfigSyntax('agent.json', (parseError as Error).message)
    }

    const validationResult = agentInfoSchema.safeParse(agentData)
    if (!validationResult.success) {
      const zodError = validationResult.error.errors[0]
      throw ValidationErrors.invalidConfigSchema(
        'agent.json',
        zodError?.path.join('.') || 'unknown',
        zodError?.message || 'Invalid schema'
      )
    }

    return {
      botId: validationResult.data.botId,
      workspaceId: validationResult.data.workspaceId,
      apiUrl: validationResult.data.apiUrl ?? DEFAULT_API_URL,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    if (ValidationErrors.isValidationError(error)) {
      throw error
    }
    throw ValidationErrors.warning(`Failed to read agent.json: ${(error as Error).message}`, 'agent.json')
  }
}

/**
 * Apply agent.local.json overrides onto an AgentInfo object.
 * Local values take precedence over agent.json values.
 */
function applyLocalOverrides(agentInfo: AgentInfo, localInfo: AgentLocalInfo): void {
  if (localInfo.botId) {
    agentInfo.botId = localInfo.botId
  }
  if (localInfo.workspaceId) {
    agentInfo.workspaceId = localInfo.workspaceId
  }
  if (localInfo.apiUrl) {
    agentInfo.apiUrl = localInfo.apiUrl
  }
  if (localInfo.devId) {
    agentInfo.devId = localInfo.devId
  }
  if (localInfo.devTargetBotId) {
    agentInfo.devTargetBotId = localInfo.devTargetBotId
  }
  if (localInfo.devApiUrl) {
    agentInfo.devApiUrl = localInfo.devApiUrl
  }
  if (localInfo.devWorkspaceId) {
    agentInfo.devWorkspaceId = localInfo.devWorkspaceId
  }
}

/**
 * Resolve agent information from agent.json and agent.local.json files.
 * agent.local.json fields take precedence over agent.json fields.
 * This is the single source of truth for loading agent configuration.
 */
export async function resolveAgent(agentPath: string, options: ResolveAgentOptions = {}): Promise<AgentInfo | null> {
  const { required = false, requireWorkspace = false, requireBot = false } = options

  const localInfo = await readAgentLocalInfo(agentPath)
  let agentInfo = await readAgentInfo(agentPath)

  // If agent.json wasn't found, try to construct AgentInfo from agent.local.json alone
  if (!agentInfo) {
    if (localInfo?.botId && localInfo?.workspaceId) {
      agentInfo = {
        botId: localInfo.botId,
        workspaceId: localInfo.workspaceId,
        apiUrl: localInfo.apiUrl,
        devId: localInfo.devId,
        devTargetBotId: localInfo.devTargetBotId,
        devApiUrl: localInfo.devApiUrl,
        devWorkspaceId: localInfo.devWorkspaceId,
      }
    } else if (required || requireWorkspace || requireBot) {
      throw ValidationErrors.requiredFileMissing('agent.json or agent.local.json')
    } else {
      return null
    }
  } else {
    // Apply agent.local.json overrides onto agent.json values
    if (localInfo) {
      applyLocalOverrides(agentInfo, localInfo)
    }
  }

  // Default apiUrl to .cloud if missing (for backwards compatibility)
  if (!agentInfo.apiUrl) {
    agentInfo.apiUrl = DEFAULT_API_URL
  }

  // Validate workspace requirement
  if (requireWorkspace && !agentInfo.workspaceId) {
    throw ValidationErrors.workspaceIdMissing()
  }

  // Validate bot requirement
  if (requireBot && !agentInfo.botId) {
    throw ValidationErrors.botIdMissing()
  }

  return agentInfo
}

/**
 * Check if agent.json exists in the given path
 */
export async function hasAgentJson(agentPath: string): Promise<boolean> {
  const agentJsonPath = path.join(agentPath, 'agent.json')
  try {
    await fs.access(agentJsonPath)
    return true
  } catch {
    return false
  }
}
