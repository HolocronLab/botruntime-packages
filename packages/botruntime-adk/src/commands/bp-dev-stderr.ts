/**
 * Marker for `bp dev`'s per-request tunnel-forward failure (logged when a request reaches the
 * tunnel while the local worker is momentarily down — typically the rebuild/restart window).
 * The current `bp dev` output may stop at this prefix; richer versions can append request/cause
 * details after it. Match the prefix only so both shapes are classified the same way.
 *
 * Keep in sync with packages/cli/src/commands/adk-dev-events.ts so fatal stderr
 * classification and non-interactive event normalization recognize the same marker.
 */
export const REQUEST_HANDLING_ERROR_MARKER = /an error occurred while handling request/i

/**
 * Classify a chunk of `bp dev` stderr as a fatal startup error, or null if not fatal.
 *
 * `econnrefused`/`connection refused` is only treated as fatal (the Botpress API being
 * unreachable) when the chunk is NOT a per-request tunnel-forward failure. A single forwarded
 * request failing because the worker is mid-restart is self-healing and must never tear down the
 * whole dev session. If `bp dev` includes a richer cause chain in that message, it can contain
 * `ECONNREFUSED`, which would otherwise trip this rule.
 */
export function classifyFatalStderr(text: string, port: string): string | null {
  for (const line of text.split('\n')) {
    const lowerLine = line.toLowerCase()

    if (lowerLine.includes('eaddrinuse') || lowerLine.includes('address already in use')) {
      return `Port ${port} is already in use. Please stop the other process or use a different port.`
    }
    if (lowerLine.includes('eacces') || lowerLine.includes('permission denied')) {
      return 'Permission denied. You may need administrator privileges.'
    }
    if (
      (lowerLine.includes('econnrefused') || lowerLine.includes('connection refused')) &&
      !REQUEST_HANDLING_ERROR_MARKER.test(line)
    ) {
      return 'Connection refused. The Botpress API may be unavailable.'
    }
  }
  return null
}

/**
 * `bp dev`/`bp deploy` abort the whole boot when an integration reports `registration_failed`
 * (e.g. an OAuth integration with no refresh token: "Some integrations failed to register: •
 * gmail: No refresh token found …"). `bp` has no flag to skip this, and the cloud bot keeps the
 * `registration_failed` status even after the integration is disabled — so codegen leaving it
 * `enabled: false` can't always prevent the abort.
 *
 * This failure is RECOVERABLE from inside the dev console: the Integrations page talks to Botpress
 * Cloud directly (not the dead bot worker), so the user can authorize/connect/configure the
 * integration there and re-run. Detecting it lets `adk dev` keep the console up with a warning
 * instead of tearing the session down. Returns each affected integration's name AND `bp`'s own
 * `statusReason` (parsed from the `• <name>: <reason>` bullets) so the warning can echo the real
 * cause — OAuth ("No refresh token found …") vs. missing config differ — rather than assuming one.
 * Returns `null` when the text isn't a registration failure.
 *
 * STOPGAP — string-coupled to `bp`'s pretty-printed output (marker line, bullet
 * format, single-line reasons), which can drift with any `bp` release. The
 * structural source for the same facts is the cloud bot itself:
 * `integrations[alias].status === 'registration_failed'` + `statusReason` (the
 * exact fields `bp` prints here). The native deploy path in
 * docs/BP-CLI-REMOVAL-DESIGN.md reads them off the updateBot response with no
 * stdout regex; this parser should not outlive that migration.
 */
const REGISTRATION_FAILURE_MARKER = /some integrations failed to register/i

export interface RecoverableRegistrationFailure {
  /** Integration alias `bp` reported as `registration_failed`. */
  name: string
  /** `bp`'s `statusReason` for the failure (OAuth, missing config, …); '' when none was printed. */
  reason: string
}

export function classifyRecoverableDeployError(text: string): { failures: RecoverableRegistrationFailure[] } | null {
  if (!REGISTRATION_FAILURE_MARKER.test(text)) {
    return null
  }
  const failures: RecoverableRegistrationFailure[] = []
  for (const line of text.split('\n')) {
    // bp formats each failure as "• <name>: <reason>" (also tolerate "-"/"*" bullets). The name is
    // colon-free; the reason (which may itself contain colons) is everything after the first colon.
    const match = line.match(/^\s*[•\-*]\s*([^:]+):\s*(.*)$/)
    const name = match?.[1]?.trim()
    if (!name || failures.some((f) => f.name === name)) {
      continue
    }
    failures.push({ name, reason: match?.[2]?.trim() ?? '' })
  }
  return failures.length > 0 ? { failures } : null
}
