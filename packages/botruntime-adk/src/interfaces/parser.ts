import { AdkError } from '@holocronlab/botruntime-analytics'
import { Dependencies, ValidationError } from '../agent-project/types.js'
import { ValidationErrors } from '../agent-project/validation-errors.js'
import { InterfaceRef, ParsedInterface } from './types.js'
import { BUILTIN_INTERFACES } from '../constants.js'

export class InterfaceParser {
  /**
   * Parse an interface version string into its components
   * Examples:
   * - "translator@1.2.0" -> { name: 'translator', version: '1.2.0', fullName: 'translator' }
   * - "myworkspace/translator@latest" -> { workspace: 'myworkspace', name: 'translator', version: 'latest', fullName: 'myworkspace/translator' }
   */
  static parseInterfaceRef(versionString: string): InterfaceRef {
    // Match pattern: [workspace/]name@version
    const match = versionString.match(/^(?:([^/]+)\/)?([^@]+)@(.+)$/)

    if (!match) {
      throw new AdkError({
        code: 'INVALID_VERSION_FORMAT',
        message: `Invalid interface version format: ${versionString}. Expected format: 'name@version' or 'workspace/name@version'`,
        expected: true,
      })
    }

    const [, workspace, name, version] = match

    return {
      workspace: workspace || undefined,
      name: name!,
      version: version!,
      fullName: workspace ? `${workspace}/${name}` : name!,
    }
  }

  /**
   * Get built-in interfaces (hard-coded constants)
   * The dependencies parameter is kept for API compatibility but not used
   */
  static parseInterfaces(_dependencies: Dependencies): {
    interfaces: ParsedInterface[]
    errors: ValidationError[]
  } {
    const interfaces: ParsedInterface[] = []
    const errors: ValidationError[] = []

    for (const [alias, versionString] of Object.entries(BUILTIN_INTERFACES)) {
      try {
        // Parse the interface reference
        const ref = this.parseInterfaceRef(versionString)

        // Validate version format
        if (!this.isValidVersion(ref.version)) {
          errors.push(ValidationErrors.invalidVersionFormat(alias, ref.version))
        }

        interfaces.push({ alias, ref, config: undefined })
      } catch (error) {
        errors.push(
          ValidationErrors.invalidDependenciesSyntax(
            `Invalid interface '${alias}': ${error instanceof Error ? error.message : String(error)}`
          )
        )
      }
    }

    return { interfaces, errors }
  }

  /**
   * Validate version format (must be exact semver or "latest")
   */
  private static isValidVersion(version: string): boolean {
    if (version === 'latest') return true
    const semverPattern = /^(\d+)\.(\d+)\.(\d+)(-[\w.]+)?(\+[\w.]+)?$/
    return semverPattern.test(version)
  }
}
