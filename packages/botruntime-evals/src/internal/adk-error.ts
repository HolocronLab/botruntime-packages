/**
 * Vendored from `@botpress/analytics` (upstream's `src/errors.ts`), which is
 * not part of this fork's repoint map. Upstream's own build bundles this
 * class directly into `dist/*.js` for every entry point that needs it, so
 * inlining it here as a local module keeps this package equally
 * self-contained without introducing a new external dependency.
 *
 * Shared base error for ADK packages. Lives in `@botpress/analytics` because
 * it's the dependency-light package every surface already shares (cli, adk,
 * ui) — so all typed errors can genuinely inherit one base instead of
 * mirroring its shape.
 *
 * The policy lives in docs/ERROR-HANDLING.md. The short version: every error
 * we *intend* to throw should carry a stable `code` (so PostHog error
 * tracking can slice issues by code) and an `expected` flag separating
 * user/environment conditions (bad input, not logged in, network down — render
 * a friendly message, low alert priority) from internal bugs (invariant
 * violations — full stack, page someone).
 *
 * The runtime package is out of scope and keeps its own `Errors.AbstractError`
 * hierarchy. The adk typed families (`DependencyError`, `Agent0*Error`) extend
 * this base; new code should start here.
 */
export class AdkError<Code extends string = string> extends Error {
  /**
   * Marker for cross-module-instance checks — `instanceof` breaks when a
   * package is duplicated in the dependency graph.
   * @internal
   */
  public static readonly __IS_ADK_BASE_ERROR = true

  /**
   * Stable SCREAMING_SNAKE_CASE identifier, e.g. 'BOT_NOT_FOUND'. Subclasses
   * pin `Code` to a literal union (`class EvalRunnerError extends
   * AdkError<EvalErrorCode>`) so typos are compile errors and `code` narrows
   * in switches.
   */
  readonly code: Code
  /**
   * True for user/environment conditions the developer can fix themselves
   * (validation, auth, connectivity). False for internal bugs. Defaults to
   * false so unclassified errors surface as bugs until someone triages them.
   */
  readonly expected: boolean
  /** Structured context. Sanitized before any telemetry leaves the machine. */
  readonly details?: Record<string, unknown>
  /** Actionable next step shown to the user, e.g. "Run 'adk login' first." */
  readonly suggestion?: string

  constructor(opts: {
    code: Code
    message: string
    expected?: boolean
    details?: Record<string, unknown>
    suggestion?: string
    cause?: unknown
  }) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = this.constructor.name
    this.code = opts.code
    this.expected = opts.expected ?? false
    // Conditional assignment keeps the optional fields absent-not-undefined,
    // which downstream tsconfigs with exactOptionalPropertyTypes require.
    if (opts.details !== undefined) {
      this.details = opts.details
    }
    if (opts.suggestion !== undefined) {
      this.suggestion = opts.suggestion
    }
  }
}

/**
 * Duck-typed guard that survives duplicated module instances in the
 * dependency graph, where `instanceof AdkError` returns false for an error
 * constructed from another copy of this module. No manual prototype walking
 * needed: static properties are inherited through the constructor chain, so
 * a subclass's constructor resolves the marker in one lookup.
 */
export function isAdkError(error: unknown): error is AdkError {
  if (error instanceof AdkError) return true
  if (!(error instanceof Error)) return false
  return (error.constructor as unknown as Record<string, unknown> | undefined)?.__IS_ADK_BASE_ERROR === true
}
