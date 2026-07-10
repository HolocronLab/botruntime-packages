import { ValidationError, ValidationErrorCode, ValidationSeverity } from './types.js'

/**
 * Factory functions for creating consistent validation errors
 */

export class ValidationErrors {
  static $type = 'ValidationError' as const

  /**
   * Type guard to check if an error is a ValidationError
   */
  static isValidationError(error: unknown): error is ValidationError {
    return error !== null && typeof error === 'object' && '$type' in error && error.$type === 'ValidationError'
  }

  // Project structure errors
  static directoryNotFound(path: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.DIRECTORY_NOT_FOUND,
      severity: ValidationSeverity.ERROR,
      message: `Project directory not found: ${path}`,
      hint: 'Ensure the directory exists and you have permission to access it',
      context: { path },
    }
  }

  static directoryAccessError(path: string, error: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.DIRECTORY_ACCESS_ERROR,
      severity: ValidationSeverity.ERROR,
      message: `Cannot access project directory: ${error}`,
      hint: 'Check file system permissions',
      context: { path, error },
    }
  }

  static requiredFileMissing(file: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.REQUIRED_FILE_MISSING,
      severity: ValidationSeverity.ERROR,
      message: `Required file '${file}' not found`,
      file,
      hint: `Create a ${file} file in your project root`,
    }
  }

  static invalidStructure(directory: string, expected: 'directory' | 'file'): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_STRUCTURE,
      severity: ValidationSeverity.WARNING,
      message: `Expected '${directory}' to be a ${expected}`,
      file: directory,
      hint: `Ensure ${directory} is a ${expected}, not a ${expected === 'directory' ? 'file' : 'directory'}`,
    }
  }

  // Configuration errors
  static invalidConfigSyntax(file: string, error: string, line?: number, column?: number): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_CONFIG_SYNTAX,
      severity: ValidationSeverity.ERROR,
      message: `Invalid syntax in ${file}: ${error}`,
      file,
      line,
      column,
      hint: 'Check for syntax errors like missing commas, brackets, or quotes',
    }
  }

  static invalidConfigSchema(file: string, field: string, error: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_CONFIG_SCHEMA,
      severity: ValidationSeverity.ERROR,
      message: `Invalid configuration in ${file}: ${error}`,
      file,
      hint: `Check the '${field}' field matches the expected schema`,
      context: { field, error },
    }
  }

  static missingRequiredField(file: string, field: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.MISSING_REQUIRED_FIELD,
      severity: ValidationSeverity.ERROR,
      message: `Missing required field '${field}' in ${file}`,
      file,
      hint: `Add the '${field}' field to your configuration`,
    }
  }

  static tableTooManyColumns(tableName: string, filePath: string, columnCount: number, max: number): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.TABLE_TOO_MANY_COLUMNS,
      severity: ValidationSeverity.ERROR,
      message: `Table '${tableName}' has ${columnCount} columns (max ${max})`,
      file: filePath,
      hint: `Reduce columns or split into multiple tables. The limit is ${max} columns per table.`,
      context: { tableName, columnCount, max },
    }
  }

  // Dependencies errors
  static invalidDependenciesSyntax(error: string, line?: number): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_DEPENDENCIES_SYNTAX,
      severity: ValidationSeverity.ERROR,
      message: `Invalid syntax in agent.config.ts dependencies: ${error}`,
      file: 'agent.config.ts',
      line,
      hint: 'Ensure agent.config.ts exports a valid dependencies object',
    }
  }

  static invalidVersionFormat(integration: string, version: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_VERSION_FORMAT,
      severity: ValidationSeverity.ERROR,
      message: `Invalid version format '${version}' for integration '${integration}'`,
      file: 'agent.config.ts',
      hint: 'Use exact versioning (e.g., "1.2.3", "2.0.0", "1.5.0")',
      context: { integration, version },
    }
  }

  static invalidIntegrationAlias(alias: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_INTEGRATION_ALIAS,
      severity: ValidationSeverity.ERROR,
      message: `Invalid integration alias '${alias}'`,
      file: 'agent.config.ts',
      hint: 'Integration aliases must be 2-100 characters and contain only lowercase letters, numbers, underscores, and hyphens (e.g., "slack", "my-slack", "slack_prod")',
      context: { alias },
    }
  }

  static unknownIntegration(integration: string, source: string, detailedMessage?: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.UNKNOWN_INTEGRATION,
      severity: ValidationSeverity.ERROR,
      message: detailedMessage || `Unknown integration '${integration}' from source '${source}'`,
      file: 'agent.config.ts',
      hint: detailedMessage ? undefined : `Check if the integration name is correct or if it exists in ${source}`,
      context: { integration, source },
    }
  }

  static integrationVersionError(integration: string, errorMessage: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.UNKNOWN_INTEGRATION,
      severity: ValidationSeverity.ERROR,
      message: errorMessage,
      file: 'agent.config.ts',
      hint: `Update the version for "${integration}" in agent.config.ts dependencies`,
    }
  }

  static unknownInterface(errorMessage: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.UNKNOWN_INTEGRATION,
      severity: ValidationSeverity.ERROR,
      message: errorMessage,
      file: 'agent.config.ts',
    }
  }

  static incompatibleVersion(integration: string, required: string, available: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INCOMPATIBLE_VERSION,
      severity: ValidationSeverity.ERROR,
      message: `Integration '${integration}' requires version ${required}, but only ${available} is available`,
      file: 'agent.config.ts',
      hint: 'Update the version requirement or check for compatible versions',
      context: { integration, required, available },
    }
  }

  // Plugin errors
  static invalidPluginAlias(alias: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_PLUGIN_ALIAS,
      severity: ValidationSeverity.ERROR,
      message: `Invalid plugin alias '${alias}'`,
      file: 'agent.config.ts',
      hint: 'Plugin aliases must be 2-100 characters and contain only lowercase letters, numbers, underscores, and hyphens (e.g., "hitl", "my-plugin")',
      context: { alias },
    }
  }

  static invalidPluginVersionFormat(plugin: string, version: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_VERSION_FORMAT,
      severity: ValidationSeverity.ERROR,
      message: `Invalid version format '${version}' for plugin '${plugin}'`,
      file: 'agent.config.ts',
      hint: 'Use exact versioning (e.g., "1.2.3", "2.0.0", "1.5.0")',
      context: { plugin, version },
    }
  }

  static unknownPlugin(plugin: string, source: string, detailedMessage?: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.UNKNOWN_PLUGIN,
      severity: ValidationSeverity.ERROR,
      message: detailedMessage || `Unknown plugin '${plugin}' from source '${source}'`,
      file: 'agent.config.ts',
      hint: detailedMessage ? undefined : `Check if the plugin name is correct or if it exists on the Botpress Hub`,
      context: { plugin, source },
    }
  }

  static invalidPluginDependency(
    plugin: string,
    integrationAlias: string,
    availableIntegrations: string[]
  ): ValidationError {
    const available = availableIntegrations.length > 0 ? availableIntegrations.join(', ') : '(none)'
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_PLUGIN_DEPENDENCY,
      severity: ValidationSeverity.ERROR,
      message: `Plugin "${plugin}" references integration "${integrationAlias}" in its dependencies, but "${integrationAlias}" is not declared in dependencies.integrations`,
      file: 'agent.config.ts',
      hint: `Add "${integrationAlias}" to dependencies.integrations, or update the plugin dependency to reference one of: ${available}`,
      context: { plugin, integrationAlias, availableIntegrations },
    }
  }

  static pluginVersionError(plugin: string, errorMessage: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.UNKNOWN_PLUGIN,
      severity: ValidationSeverity.ERROR,
      message: errorMessage,
      file: 'agent.config.ts',
      hint: `Update the version for "${plugin}" in agent.config.ts dependencies`,
    }
  }

  // File errors
  static fileTooLarge(file: string, size: number, maxSize: number): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.FILE_TOO_LARGE,
      severity: ValidationSeverity.ERROR,
      message: `File '${file}' is too large (${formatBytes(size)} > ${formatBytes(maxSize)})`,
      file,
      hint: 'Reduce file size or split into smaller files',
      context: { size, maxSize },
    }
  }

  static invalidFileType(file: string, type: string, allowedTypes: string[]): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_FILE_TYPE,
      severity: ValidationSeverity.ERROR,
      message: `Invalid file type '${type}' for file '${file}'`,
      file,
      hint: `Allowed file types: ${allowedTypes.join(', ')}`,
      context: { type, allowedTypes },
    }
  }

  static invalidFileName(file: string, reason: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_FILE_NAME,
      severity: ValidationSeverity.ERROR,
      message: `Invalid file name '${file}': ${reason}`,
      file,
      hint: 'Use lowercase letters, numbers, and hyphens only',
    }
  }

  static duplicateFileName(file: string, existingFile: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.DUPLICATE_FILE_NAME,
      severity: ValidationSeverity.ERROR,
      message: `Duplicate file name '${file}' conflicts with '${existingFile}'`,
      file,
      hint: 'Rename one of the files to avoid conflicts',
      context: { existingFile },
    }
  }

  // Runtime errors
  static buildFailed(error: string, file?: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.BUILD_FAILED,
      severity: ValidationSeverity.ERROR,
      message: `Build failed: ${error}`,
      file,
      hint: 'Check the error message and fix any issues in your code',
    }
  }

  static syntaxError(file: string, error: string, line?: number, column?: number): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.SYNTAX_ERROR,
      severity: ValidationSeverity.ERROR,
      message: `Syntax error: ${error}`,
      file,
      line,
      column,
      hint: 'Check for missing semicolons, brackets, or other syntax issues',
    }
  }

  static typeError(file: string, error: string, line?: number): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.TYPE_ERROR,
      severity: ValidationSeverity.ERROR,
      message: `Type error: ${error}`,
      file,
      line,
      hint: 'Ensure types match expected values and imports are correct',
    }
  }

  static importError(file: string, module: string, error: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.IMPORT_ERROR,
      severity: ValidationSeverity.ERROR,
      message: `Cannot import '${module}': ${error}`,
      file,
      hint: 'Check if the module exists and is properly installed',
      context: { module },
    }
  }

  // Knowledge errors
  static unsafeKnowledgePath(knowledgeBase: string, pattern: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_FILE_NAME,
      severity: ValidationSeverity.ERROR,
      message: `Knowledge base '${knowledgeBase}' contains unsafe path pattern '${pattern}'`,
      file: `src/knowledge/${knowledgeBase}.ts`,
      hint: 'Knowledge patterns must not reference files outside the agent directory (remove ../ or absolute paths)',
      context: { knowledgeBase, pattern },
    }
  }

  // Agent linking errors
  static agentNotLinked(): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.AGENT_NOT_LINKED,
      severity: ValidationSeverity.ERROR,
      message: 'Agent is not linked to a workspace',
      file: 'agent.json',
      hint: 'Run "brt login" if needed, then "brt link --bot-id <id> --key-stdin".',
    }
  }

  static workspaceIdMissing(): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.AGENT_NOT_LINKED,
      severity: ValidationSeverity.ERROR,
      message: 'No workspaceId found in agent.json',
      file: 'agent.json',
      hint: 'Run "brt login" if needed, then "brt link --bot-id <id> --key-stdin".',
    }
  }

  static botIdMissing(): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.AGENT_NOT_LINKED,
      severity: ValidationSeverity.ERROR,
      message: 'No botId found in agent.json',
      file: 'agent.json',
      hint: 'Run "brt login" if needed, then "brt link --bot-id <id> --key-stdin".',
    }
  }

  // Utility functions
  static info(message: string, file?: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_STRUCTURE, // Generic code for info
      severity: ValidationSeverity.INFO,
      message,
      file,
    }
  }

  static warning(message: string, file?: string, hint?: string): ValidationError {
    return {
      $type: ValidationErrors.$type,
      code: ValidationErrorCode.INVALID_STRUCTURE, // Generic code for warnings
      severity: ValidationSeverity.WARNING,
      message,
      file,
      hint,
    }
  }
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
