import { z } from '@holocronlab/botruntime-sdk'
import type { StatusVerdict } from './types'

export namespace Errors {
  export enum ErrorLevel {
    Warning = 'warning',
    Critical = 'critical',
  }

  export enum ErrorType {
    Definition = 'definition',
    Runtime = 'runtime',
  }

  export enum ErrorCode {
    InvalidPrimitiveDefinition = 'INVALID_PRIMITIVE_DEFINITION',
    InvalidMessage = 'INVALID_MESSAGE',
    IntegrationUnavailable = 'INTEGRATION_UNAVAILABLE',
    PluginUnavailable = 'PLUGIN_UNAVAILABLE',
  }

  export function toErrorString(e: unknown, includeStack = false): string {
    try {
      if (e == null) return String(e)
      if (typeof e === 'string') return e

      // Native Error (incl. subclasses)
      if (e instanceof Error) {
        const base = `${e.name || 'Error'}: ${e.message || '(no message)'}`
        const errorWithCause = e as Error & { cause?: unknown }
        const cause = errorWithCause.cause ? `; cause=${toErrorString(errorWithCause.cause, includeStack)}` : ''
        const stack = includeStack && e.stack ? `\n${e.stack}` : ''
        return `${base}${cause}${stack}`
      }

      // AggregateError
      if (typeof AggregateError !== 'undefined' && e instanceof AggregateError) {
        return `AggregateError: ${e.errors.map((x) => toErrorString(x, includeStack)).join('; ')}`
      }

      // Axios (common)
      const val = e as Record<string, unknown>
      if (val?.isAxiosError) {
        const resp = val.response as Record<string, unknown> | undefined
        const status = resp?.status ? ` ${resp.status}` : ''
        const msg = (val.message as string) || 'AxiosError'
        return `AxiosError${status}: ${msg}`
      }

      // Respect custom toString if meaningful
      if (typeof val?.toString === 'function') {
        const s = val.toString()
        if (s && s !== '[object Object]') return s
      }

      // Safe JSON (handles bigint + circular + nested Errors)
      const seen = new WeakSet<object>()
      const json = JSON.stringify(val, (_k, v) => {
        if (typeof v === 'bigint') return String(v)
        if (v instanceof Error)
          return {
            name: v.name,
            message: v.message,
            stack: includeStack ? v.stack : undefined,
          }
        if (v && typeof v === 'object') {
          if (seen.has(v)) return '[Circular]'
          seen.add(v)
        }
        return v
      })
      return json ?? String(val)
    } catch {
      try {
        return String(e)
      } catch {
        return 'Unknown error'
      }
    }
  }

  abstract class AbstractError<Code extends ErrorCode> extends Error {
    /** @internal */
    public static readonly __IS_ADK_ERROR = true
    public static readonly code: ErrorCode
    public static readonly level: ErrorLevel
    public static readonly type: ErrorType

    constructor(messageOrError?: string | z.ZodError, zodError?: z.ZodError) {
      let message: string

      if (typeof messageOrError === 'string') {
        // First param is a message string
        message = messageOrError
        if (zodError) {
          // Second param is ZodError - append formatted errors
          message += '\n' + formatZodError(zodError)
        }
      } else if (z.is.zuiError(messageOrError)) {
        // First param is ZodError
        message = formatZodError(messageOrError)
      } else {
        // No params provided
        message = ''
      }

      super(message)
      this.name = this.constructor.name
    }

    public get code(): Code {
      return (this.constructor as typeof AbstractError).code as Code
    }

    public get level(): ErrorLevel {
      return (this.constructor as typeof AbstractError).level
    }

    public get type(): ErrorType {
      return (this.constructor as typeof AbstractError).type
    }
  }

  function formatZodError(error: z.ZodError): string {
    const issues = error.errors.map((issue) => {
      const path = issue.path.length > 0 ? `[${issue.path.join('.')}]` : ''
      return `  - ${path} ${issue.message}`
    })

    return `Validation failed:\n${issues.join('\n')}`
  }

  export class InvalidPrimitiveError extends AbstractError<ErrorCode.InvalidPrimitiveDefinition> {
    public static readonly level = ErrorLevel.Critical
    public static readonly type = ErrorType.Definition
    public static readonly code = ErrorCode.InvalidPrimitiveDefinition

    constructor(messageOrError?: string | z.ZodError, zodError?: z.ZodError) {
      // If no arguments provided, use default message
      if (!messageOrError && !zodError) {
        super('The provided primitive definition is invalid.')
      } else {
        super(messageOrError, zodError)
      }
    }
  }

  export class InvalidMessageError extends AbstractError<ErrorCode.InvalidMessage> {
    public static readonly level = ErrorLevel.Warning
    public static readonly type = ErrorType.Runtime
    public static readonly code = ErrorCode.InvalidMessage

    constructor(message: string) {
      super(message)
    }
  }

  /**
   * Thrown when bot code (or the autonomous tool layer) tries to call an
   * integration or plugin that is present for discovery but not `available`
   * (unconfigured / not installed / disabled / unresolved / errored).
   *
   * This is the typed, catchable replacement for the opaque SDK error that
   * previously crashed the turn. It is a `Runtime`/`Warning` error: a single
   * inert dependency must never be process-fatal. The structured fields let the
   * autonomous runner surface a useful tool-error and let callers branch on the
   * reason without string-matching.
   */
  export interface UnavailableDependencyInfo {
    /** The dependency alias (e.g. `slack`). */
    alias: string
    /** The action being called, when known. */
    action?: string
    /** The capability verdict that made it uncallable. */
    status: StatusVerdict
    /** Override the auto-derived remediation hint. */
    remediation?: string
  }

  function remediationFor(kind: 'integration' | 'plugin', alias: string, status: StatusVerdict): string {
    switch (status.state) {
      case 'unconfigured':
        return status.missingFields && status.missingFields.length > 0
          ? `Provide the required configuration (${status.missingFields.join(', ')}) for ${kind} "${alias}" in the Botpress Control Panel, then redeploy.`
          : `Configure ${kind} "${alias}" (authorization or credentials) in the Botpress Control Panel, then redeploy.`
      case 'not_installed':
        return `${kind} "${alias}" is declared but its module is not synced. Run \`adk build\` (or \`adk dev\`) to install it.`
      case 'disabled':
        return `${kind} "${alias}" is disabled. Enable it in agent.config.ts or the Botpress Control Panel.`
      case 'unresolved':
        return status.reason
          ? `${kind} "${alias}" could not be resolved: ${status.reason}.`
          : `${kind} "${alias}" could not be resolved.`
      case 'errored':
        return status.reason
          ? `${kind} "${alias}" failed to load: ${status.reason}.`
          : `${kind} "${alias}" failed to load.`
      default:
        return `${kind} "${alias}" is unavailable.`
    }
  }

  function formatUnavailableMessage(
    kind: 'Integration' | 'Plugin',
    alias: string,
    action: string | undefined,
    status: StatusVerdict,
    remediation: string
  ): string {
    const target = action
      ? `action "${action}" on ${kind.toLowerCase()} "${alias}"`
      : `${kind.toLowerCase()} "${alias}"`
    const detail = status.reason
      ? ` (${status.reason})`
      : status.missingFields && status.missingFields.length > 0
        ? ` (missing: ${status.missingFields.join(', ')})`
        : ''
    return `Cannot call ${target}: it is ${status.state}${detail}. ${remediation}`
  }

  export class IntegrationUnavailableError extends AbstractError<ErrorCode.IntegrationUnavailable> {
    public static readonly level = ErrorLevel.Warning
    public static readonly type = ErrorType.Runtime
    public static readonly code = ErrorCode.IntegrationUnavailable

    public readonly alias: string
    public readonly action: string | undefined
    public readonly status: StatusVerdict
    public readonly missingFields: string[]
    public readonly remediation: string

    constructor(info: UnavailableDependencyInfo) {
      const remediation = info.remediation ?? remediationFor('integration', info.alias, info.status)
      super(formatUnavailableMessage('Integration', info.alias, info.action, info.status, remediation))
      this.alias = info.alias
      this.action = info.action
      this.status = info.status
      this.missingFields = info.status.missingFields ?? []
      this.remediation = remediation
    }
  }

  export class PluginUnavailableError extends AbstractError<ErrorCode.PluginUnavailable> {
    public static readonly level = ErrorLevel.Warning
    public static readonly type = ErrorType.Runtime
    public static readonly code = ErrorCode.PluginUnavailable

    public readonly alias: string
    public readonly action: string | undefined
    public readonly status: StatusVerdict
    public readonly missingFields: string[]
    public readonly remediation: string

    constructor(info: UnavailableDependencyInfo) {
      const remediation = info.remediation ?? remediationFor('plugin', info.alias, info.status)
      super(formatUnavailableMessage('Plugin', info.alias, info.action, info.status, remediation))
      this.alias = info.alias
      this.action = info.action
      this.status = info.status
      this.missingFields = info.status.missingFields ?? []
      this.remediation = remediation
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic constraint requires any for constructor args and abstract error type
  export function isError<T extends new (...args: any[]) => AbstractError<any>>(
    error: unknown,
    errorClass: T
  ): error is InstanceType<T> {
    return (
      error instanceof errorClass && (error.constructor as unknown as Record<string, unknown>).__IS_ADK_ERROR === true
    )
  }

  export function isAdkError(error: unknown): error is AbstractError<ErrorCode> {
    try {
      if (typeof error !== 'object' || error === null) {
        return false
      }

      if (!(error instanceof Error)) {
        return false
      }

      const constructor = error.constructor
      if (!constructor || typeof constructor !== 'function') {
        return false
      }

      return (constructor as unknown as Record<string, unknown>).__IS_ADK_ERROR === true
    } catch {
      return false
    }
  }

  export function isDefinitionError(error: unknown): error is AbstractError<ErrorCode> {
    try {
      if (!isAdkError(error)) {
        return false
      }

      const abstractError = error as AbstractError<ErrorCode>
      return abstractError.type === ErrorType.Definition
    } catch {
      return false
    }
  }

  export function isRuntimeError(error: unknown): error is AbstractError<ErrorCode> {
    try {
      if (!isAdkError(error)) {
        return false
      }

      const abstractError = error as AbstractError<ErrorCode>
      return abstractError.type === ErrorType.Runtime
    } catch {
      return false
    }
  }
}
