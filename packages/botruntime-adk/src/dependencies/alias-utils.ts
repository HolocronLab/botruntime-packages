const FRIENDLY_ALIAS_RE = /^[a-z0-9_-]{2,100}$/

/**
 * Botpress internal ID prefixes that are never user-facing friendly aliases.
 * Aliases that start with one of these are always considered unfriendly even
 * though they may otherwise satisfy the character-class regex.
 */
const BP_INTERNAL_ID_PREFIXES = ['intver_', 'plgver_', 'int_', 'plg_']

/**
 * Returns true if the alias looks like a Botpress platform ID (e.g. `intver_01JK…`)
 * rather than a human-authored name.
 */
function isBotpressInternalId(alias: string): boolean {
  return BP_INTERNAL_ID_PREFIXES.some((prefix) => alias.startsWith(prefix))
}

export function isFriendlyAlias(alias: string): boolean {
  return FRIENDLY_ALIAS_RE.test(alias) && !isBotpressInternalId(alias)
}

/**
 * Derive a friendly alias for a cloud-side integration/plugin entry.
 *
 * Strategy:
 * 1. If the cloud's alias is already friendly (matches the regex and is not a
 *    Botpress-internal ID like `intver_*`), use it as-is.
 * 2. Otherwise, sanitize cloud.name (strip namespace prefix, lowercase, replace
 *    non-conforming chars with `-`).
 * 3. Disambiguate against `used` with a numeric suffix.
 */
export function generateFriendlyAlias(cloudName: string | undefined, cloudAlias: string, used: Set<string>): string {
  if (isFriendlyAlias(cloudAlias) && !used.has(cloudAlias)) return cloudAlias

  const base = cloudName?.split('/').at(-1) ?? cloudAlias
  const sanitized = base.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  let candidate = sanitized
  let n = 2
  while (used.has(candidate)) {
    candidate = `${sanitized}-${n}`
    n++
  }
  return candidate
}
