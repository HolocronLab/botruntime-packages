import { Primitives, Errors } from '@holocronlab/botruntime-runtime/internal'
import { ValidationError, ValidationErrorCode, ValidationSeverity } from './types.js'

export interface ExpandExportsOptions {
  absolutePath: string
  relPath: string
  filename: string
  onWarning: (warning: ValidationError) => void
}

/**
 * Expands the exports of a module to include all properties,
 * including those on the default export if it is an object or array.
 * For example, exports of type `{ default: { a: 1, b: 2 } }`
 * will be expanded to `{ "default.a": 1, "default.b": 2 }`.
 *
 * @param options - Options for expanding exports
 * @returns A record of expanded exports
 */
export async function expandExports(options: ExpandExportsOptions): Promise<Record<string, unknown>> {
  const { absolutePath, relPath, filename, onWarning } = options
  let result: Record<string, unknown> = {}

  try {
    // Bust module cache by adding timestamp query parameter
    // This ensures we always get fresh imports on reload
    const importPath = `${absolutePath}?t=${Date.now()}`
    const exports = await import(importPath)

    if (typeof exports === 'object' && exports !== null) {
      for (const key of Object.keys(exports)) {
        try {
          result[key] = exports[key]
        } catch (error) {
          // Skip exports that throw on access
          if (Errors.isAdkError(error)) {
            onWarning({
              $type: 'ValidationError',
              code: ValidationErrorCode.INVALID_PRIMITIVE_DEFINITION,
              severity: ValidationSeverity.WARNING,
              message: error.message,
              file: relPath,
              hint: `Invalid primitive instantiation in ${filename} -> ${key}`,
            })
          }
        }
      }

      // Handle default exports
      if (typeof exports.default === 'object' && exports.default !== null) {
        try {
          const definition = Primitives.Definitions.getDefinition(exports.default)
          if (!definition) {
            // If not a primitive, expand the default export
            for (const key of Object.keys(exports.default)) {
              try {
                result[`default.${key}`] = exports.default[key]
              } catch (error) {
                if (Errors.isAdkError(error)) {
                  onWarning({
                    $type: 'ValidationError',
                    code: ValidationErrorCode.INVALID_PRIMITIVE_DEFINITION,
                    severity: ValidationSeverity.WARNING,
                    message: error.message,
                    file: relPath,
                    hint: `Invalid primitive instantiation in ${filename} -> default.${key}`,
                  })
                }
              }
            }
          }
        } catch (error) {
          // If accessing default throws, check if it's an ADK error
          if (Errors.isAdkError(error)) {
            onWarning({
              $type: 'ValidationError',
              code: ValidationErrorCode.INVALID_PRIMITIVE_DEFINITION,
              severity: ValidationSeverity.WARNING,
              message: error.message,
              file: relPath,
              hint: `Invalid primitive instantiation in ${filename} -> default`,
            })
          }
        }
      }
    }

    return result
  } catch (importError: unknown) {
    // Check if it's an ADK error thrown during primitive instantiation
    if (Errors.isAdkError(importError)) {
      onWarning({
        $type: 'ValidationError',
        code: ValidationErrorCode.INVALID_PRIMITIVE_DEFINITION,
        severity: ValidationSeverity.WARNING,
        message: importError.message,
        file: relPath,
        hint: `Invalid primitive instantiation in ${filename}`,
      })
      return {}
    }

    // Check error cause chain for ADK errors (handles module initialization errors)
    let currentError: unknown = importError
    while (currentError) {
      if (Errors.isAdkError(currentError)) {
        onWarning({
          $type: 'ValidationError',
          code: ValidationErrorCode.INVALID_PRIMITIVE_DEFINITION,
          severity: ValidationSeverity.WARNING,
          message: currentError.message,
          file: relPath,
          hint: `Invalid primitive instantiation in ${filename}`,
        })
        return {}
      }
      currentError = currentError instanceof Error ? currentError.cause : undefined
    }

    // Re-throw other import errors
    throw importError
  }
}
