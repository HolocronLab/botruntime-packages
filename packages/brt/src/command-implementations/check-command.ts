import * as fs from 'fs'
import * as path from 'path'
import type commandDefinitions from '../command-definitions'
import * as adkBundle from '../adk-bundle'
import * as errors from '../errors'
import { GlobalCommand } from './global-command'

const fatalDiscoveryCodes = new Set(['IMPORT_ERROR', 'INVALID_PRIMITIVE_DEFINITION'])

export type CheckCommandDefinition = typeof commandDefinitions.check

export class CheckCommand extends GlobalCommand<CheckCommandDefinition> {
  public async run(): Promise<void> {
    const workDir = path.resolve(this.argv.workDir)
    if (!adkBundle.isAgentProject(workDir)) {
      throw new errors.BotpressCLIError(`brt check requires an ADK project with agent.config.ts in ${workDir}`)
    }

    const { AgentProject } = await adkBundle.loadAdkProjectTools()
    const project = await AgentProject.load(workDir, { offline: true, noCache: true })
    adkBundle.buildRecurringEventsManifest(project)
    const diagnostics = [
      ...project.info.errors,
      ...project.info.warnings.filter((warning: { code: string }) => fatalDiscoveryCodes.has(warning.code)),
    ]

    if (diagnostics.length > 0) {
      const lines = diagnostics.map((diagnostic) => {
        const location = diagnostic.file ? ` (${diagnostic.file})` : ''
        return `  - ${diagnostic.code}: ${diagnostic.message}${location}`
      })
      throw new errors.BotpressCLIError(`Primitive discovery failed:\n${lines.join('\n')}`)
    }

    const sourceFiles = fs
      .readdirSync(path.join(workDir, 'src'), { withFileTypes: true, recursive: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          /\.[jt]s$/i.test(entry.name) &&
          !/\.d\.ts$/i.test(entry.name) &&
          !/\.test\.[jt]s$/i.test(entry.name)
      )
    const primitiveGroups = [
      project.conversations,
      project.knowledge,
      project.triggers,
      project.workflows,
      project.actions,
      project.tables,
      project.customComponents,
      project.tools,
    ]
    const userPrimitiveCount = primitiveGroups
      .flat()
      .filter((primitive) => primitive.path !== '<adk:builtin>').length
    if (sourceFiles.length > 0 && userPrimitiveCount === 0) {
      throw new errors.BotpressCLIError(
        'Primitive discovery found no user primitives in a non-empty src tree; refusing to accept an empty bot'
      )
    }

    this.logger.success('Project check passed (offline discovery)')
  }
}
