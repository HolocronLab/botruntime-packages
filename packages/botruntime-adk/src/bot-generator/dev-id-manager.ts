import path from 'path'
import fs from 'fs/promises'
import createDebug from 'debug'
import type { Client } from '@holocronlab/botruntime-client'
import { getProjectClient } from '../auth/index.js'
import { AgentProject, AgentProjectLoader } from '../agent-project/agent-project.js'
import { ValidationError } from '../agent-project/types.js'
import { ValidationErrors as RealValidationErrors } from '../agent-project/validation-errors.js'

const debug = createDebug('adk:dev-id-manager')

export interface ProjectCache {
  devId?: string
  botId?: string
}

export interface ValidationErrorsLike {
  agentNotLinked: () => ValidationError | Error
}

export interface DevIdManagerOptions {
  loadAgentProject?: AgentProjectLoader
  validationErrors?: ValidationErrorsLike
}

export class DevIdManager {
  private projectPath: string
  private botProjectPath: string
  private projectCachePath: string
  private client?: Client
  private loadAgentProject: AgentProjectLoader
  private validationErrors: ValidationErrorsLike

  constructor(projectPath: string, botProjectPath: string, options: DevIdManagerOptions = {}) {
    this.projectPath = projectPath
    this.botProjectPath = botProjectPath
    this.projectCachePath = path.join(botProjectPath, '.botpress', 'project.cache.json')
    this.loadAgentProject = options.loadAgentProject ?? ((p) => AgentProject.load(p))
    this.validationErrors = options.validationErrors ?? RealValidationErrors
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      const project = await this.getProject()

      this.client = await getProjectClient({
        project,
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
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.projectCachePath), { recursive: true })

      await fs.writeFile(this.projectCachePath, JSON.stringify(cache, null, 2))
    } catch (error) {
      console.error('Error saving project.cache.json:', error)
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
        devId: projectCache.devId,
      })
    }
  }

  async restoreDevId(): Promise<void> {
    // Read from agent.json using AgentProject
    const project = await this.getProject()
    const agentInfo = project.agentInfo

    if (agentInfo?.devId || agentInfo?.botId) {
      // Create project cache with the saved IDs
      const cache: ProjectCache = {}

      if (agentInfo.devId) {
        cache.devId = agentInfo.devId
      }

      if (agentInfo.botId) {
        cache.botId = agentInfo.botId
      }

      await this.saveProjectCache(cache)
    }
  }

  async checkDevBotExists(): Promise<boolean> {
    const project = await this.getProject()
    const agentInfo = project.agentInfo

    // If we have a devId, check if the bot still exists
    if (agentInfo?.devId) {
      try {
        const client = await this.getClient()
        await client.getBot({ id: agentInfo.devId })
        // Bot exists
        return true
      } catch {
        // Bot doesn't exist or error getting it
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
