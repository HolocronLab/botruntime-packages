/**
 * Detects AJV-shaped "data must have required property '<name>'" errors from
 * Cloud (e.g. `InvalidDataFormatError`) and returns the missing field names.
 * Returns `null` when the error is not a missing-required-fields validation error.
 *
 * This is the single shared matcher used by both the build/CLI side (the brt
 * `DependencyManager`, which parses the install-time error to record
 * `missingFields`) and the runtime side (the integration/plugin action proxies,
 * which use it as a call-time drift backstop to normalize an opaque SDK config
 * error into a typed `IntegrationUnavailableError` / `PluginUnavailableError`).
 * Keeping it in one place means the two paths can never disagree on what counts
 * as "missing required configuration".
 */
export function extractMissingRequiredFields(err: unknown): string[] | null {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (!message.includes('required property')) return null
  // Cloud validates the action *input* with the same AJV machinery and marks
  // those rejections with `invalid input for action "<type>"`. A missing
  // required input field is a caller bug, not missing integration/plugin
  // configuration — let it propagate untouched.
  if (message.includes('invalid input for action')) return null
  const fields = new Set<string>()
  const re = /required property ['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(message)) !== null) {
    if (match[1]) fields.add(match[1])
  }
  return fields.size > 0 ? [...fields] : null
}
