import { AdkError } from '@holocronlab/botruntime-analytics'

export const DEPENDENCY_ERROR_CODES = [
  'AUTH_REQUIRED',
  'INTEGRATION_NOT_FOUND',
  'PLUGIN_NOT_FOUND',
  'INTERFACE_NOT_FOUND',
  'VERSION_NOT_FOUND',
  'MISSING_INPUT',
  'MISSING_DEPENDENCY',
  'AMBIGUOUS_DEPENDENCY',
  'INTERFACE_NOT_IMPLEMENTED',
  'SNAPSHOT_DRIFT',
  'UNINSTALL_REQUIRES_CONFIRMATION',
  'SAME_SOURCE_TARGET',
  'SOURCE_SNAPSHOT_MISSING',
  'MIGRATION_CONFLICT',
  'INVALID_CONFIG',
  'BOT_NOT_FOUND',
  'BUILTIN_INTERFACE_IMMUTABLE',
  'PROD_CONFIRMATION_REQUIRED',
  'UNCONFIGURED_DEPENDENCIES',
] as const

export type DependencyErrorCode = (typeof DEPENDENCY_ERROR_CODES)[number]

/**
 * Dependency-resolution failures are user/environment conditions (missing or
 * ambiguous dependency, unauthenticated, confirmation required, …), so the
 * whole family reports `expected: true` to PostHog.
 */
export class DependencyError extends AdkError<DependencyErrorCode> {
  constructor(opts: {
    code: DependencyErrorCode
    message: string
    details?: Record<string, unknown>
    suggestion?: string
  }) {
    super({ ...opts, expected: true })
  }
}

export const DEPENDENCY_WARNING_CODES = [
  'MIGRATED_DEPENDENCIES',
  'CLOUD_FETCH_PARTIAL',
  'NO_DEV_BOT',
  'NO_PROD_BOT',
] as const
export type DependencyWarningCode = (typeof DEPENDENCY_WARNING_CODES)[number]
