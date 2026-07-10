import path from 'path'
import fs from 'fs/promises'
import createDebug from 'debug'
import type { Client } from '@holocronlab/botruntime-client'
import { getProjectClient } from '../auth/index.js'
import type { ServerConnectionCredentials } from '../auth/index.js'
import { AgentProject, AgentProjectLoader } from '../agent-project/agent-project.js'
import { ValidationError } from '../agent-project/types.js'
import { ValidationErrors as RealValidationErrors } from '../agent-project/validation-errors.js'
import { readAgentLocalInfo } from '../agent-project/agent-resolver.js'
import { assertDevBotMatchesTarget, resolveDevBotTargetIdentity } from '../integrations/config-utils.js'
import { AdkError } from '@holocronlab/botruntime-analytics'

const debug = createDebug('adk:dev-id-manager')

export interface ProjectCache {
  devId?: string
  devTargetBotId?: string
  devApiUrl?: string
  devWorkspaceId?: string
  botId?: string
}

export interface ResolvedDevProjectCache {
  devId: string
  devTargetBotId: string
  devApiUrl: string
  devWorkspaceId: string
}

export interface ValidationErrorsLike {
  agentNotLinked: () => ValidationError | Error
}

export interface DevIdManagerOptions {
  loadAgentProject?: AgentProjectLoader
  validationErrors?: ValidationErrorsLike
  credentials?: ServerConnectionCredentials
}

export class DevIdManager {
  private projectPath: string
  private botProjectPath: string
  private projectCachePath: string
  private client?: Client
  private loadAgentProject: AgentProjectLoader
  private validationErrors: ValidationErrorsLike
  private credentials?: ServerConnectionCredentials

  constructor(projectPath: string, botProjectPath: string, options: DevIdManagerOptions = {}) {
    this.projectPath = projectPath
    this.botProjectPath = botProjectPath
    this.projectCachePath = path.join(botProjectPath, '.botpress', 'project.cache.json')
    this.loadAgentProject = options.loadAgentProject ?? ((p) => AgentProject.load(p, { offline: true }))
    this.validationErrors = options.validationErrors ?? RealValidationErrors
    this.credentials = options.credentials
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      if (!this.credentials) {
        throw new AdkError({
          code: 'INVALID_SERVER_CONFIG_TARGET',
          message: 'Checking a dev bot requires explicit token, apiUrl, and workspaceId credentials.',
          expected: true,
        })
      }

      this.client = await getProjectClient({
        credentials: this.credentials,
        apiUrl: this.credentials.apiUrl,
        workspaceId: this.credentials.workspaceId,
        headers: {
          'x-multiple-integrations': 'true',
        },
      })
    }
    return this.client
  }

  async getProject(): Promise<AgentProject> {
    return await this.loadAgentProject(this.projectPath)
  }

  async readProjectCache(): Promise<ProjectCache> {
    try {
      const content = await fs.readFile(this.projectCachePath, 'utf-8')

      if (content.trim().length === 0) {
        debug('project cache is empty, treating as bootstrap state: %s', this.projectCachePath)
        return {}
      }

      const parsed = JSON.parse(content)

      if (!isProjectCache(parsed)) {
        debug('project cache contains unexpected JSON type, treating as bootstrap state: %s', this.projectCachePath)
        return {}
      }

      return parsed
    } catch (error) {
      if (isMissingFileError(error)) {
        debug('project cache missing, treating as bootstrap state: %s', this.projectCachePath)
        return {}
      }

      if (error instanceof SyntaxError) {
        debug(
          'project cache contains transient invalid JSON, treating as bootstrap state: %s (%O)',
          this.projectCachePath,
          error
        )
        return {}
      }

      console.error('Error reading project.cache.json:', error)
    }

    return {}
  }

  async saveProjectCache(cache: ProjectCache): Promise<void> {
    await fs.mkdir(path.dirname(this.projectCachePath), { recursive: true })
    const temporaryPath = `${this.projectCachePath}.tmp-${process.pid}-${Date.now()}`
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(cache, null, 2))
      await fs.rename(temporaryPath, this.projectCachePath)
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  async preserveDevId(): Promise<void> {
    // Read devId from project cache after bp dev creates it
    const projectCache = await this.readProjectCache()
    if (projectCache.devId) {
      // Save it to agent.json using AgentProject methods
      const project = await this.getProject()

      if (!project.agentInfo) {
        // Agent must be linked before running dev mode
        throw this.validationErrors.agentNotLinked()
      }

      // Update agent.local.json with devId (not agent.json — avoids merge conflicts)
      await project.updateAgentLocalInfo({
        ...(projectCache.devTargetBotId && projectCache.devApiUrl && projectCache.devWorkspaceId
          ? {
              devId: projectCache.devId,
              devTargetBotId: projectCache.devTargetBotId,
              devApiUrl: projectCache.devApiUrl.replace(/\/+$/, ''),
              devWorkspaceId: projectCache.devWorkspaceId,
            }
          : {
              devId: undefined,
              devTargetBotId: undefined,
              devApiUrl: undefined,
              devWorkspaceId: undefined,
            }),
      })
    }
  }

  async restoreDevId(target?: ResolvedDevProjectCache): Promise<void> {
    // Generation already verified this exact pair. Re-reading merged agent metadata
    // here could reintroduce a stale target, while bootstrap must clear any old pair.
    await this.saveProjectCache(
      target
        ? { ...target, devApiUrl: target.devApiUrl.replace(/\/+$/, '') }
        : {}
    )
  }

  async checkDevBotExists(): Promise<boolean> {
    const localInfo = await readAgentLocalInfo(this.projectPath)

    if (localInfo?.devId) {
      const hasAnyScope = localInfo.devApiUrl !== undefined || localInfo.devWorkspaceId !== undefined
      const scoped = Boolean(
        localInfo.devApiUrl &&
          localInfo.devWorkspaceId &&
          this.credentials &&
          localInfo.devApiUrl.replace(/\/+$/, '') === this.credentials.apiUrl.replace(/\/+$/, '') &&
          localInfo.devWorkspaceId === this.credentials.workspaceId
      )
      if (hasAnyScope && !scoped) return false
      const client = await this.getClient()
      try {
        const { bot } = await client.getBot({ id: localInfo.devId })
        if (scoped && localInfo.devTargetBotId) {
          assertDevBotMatchesTarget(bot, {
            botId: localInfo.devTargetBotId,
            runtimeBotId: localInfo.devId,
          })
        } else {
          resolveDevBotTargetIdentity(bot, localInfo.devId)
        }
        return true
      } catch {
        return false
      }
    }

    // No devId set
    return false
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function isProjectCache(value: unknown): value is ProjectCache {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
