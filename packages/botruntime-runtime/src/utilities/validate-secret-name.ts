/**
 * Reserved prefixes that cannot be used as secret names.
 * SECRET_ would cause double-prefixing (SECRET_SECRET_FOO).
 * BP_ and BOTPRESS_ may collide with platform-internal env vars.
 */
const RESERVED_PREFIXES = ['SECRET_', 'BP_', 'BOTPRESS_']

/**
 * Validates a secret name according to botruntime rules:
 * - SCREAMING_SNAKE_CASE: only uppercase letters (A-Z), digits (0-9), and underscores
 * - Minimum 2 characters
 * - Must start with a letter
 * - Must not start with reserved prefixes (SECRET_, BP_, BOTPRESS_)
 */
export function validateSecretName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Secret name must be a non-empty string' }
  }

  if (name.length < 2) {
    return { valid: false, error: `Secret name "${name}" must be at least 2 characters long` }
  }

  if (!/^[A-Z]/.test(name)) {
    return { valid: false, error: `Secret name "${name}" must start with an uppercase letter` }
  }

  if (/_$/.test(name)) {
    return {
      valid: false,
      error: `Secret name "${name}" must not end with an underscore`,
    }
  }

  if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(name)) {
    return {
      valid: false,
      error: `Secret name "${name}" must be SCREAMING_SNAKE_CASE (uppercase letters, digits, and underscores only)`,
    }
  }

  for (const prefix of RESERVED_PREFIXES) {
    if (name.startsWith(prefix)) {
      return {
        valid: false,
        error: `Secret name "${name}" must not start with reserved prefix "${prefix}"`,
      }
    }
  }

  return { valid: true }
}

/**
 * Validates all secret names in a secret definition object.
 * Throws an error if any secret name is invalid.
 */
export function validateSecretDefinitions(
  secrets: Record<string, { optional?: boolean | undefined; description?: string | undefined }>,
  context: string
): void {
  for (const secretName of Object.keys(secrets)) {
    const validation = validateSecretName(secretName)
    if (!validation.valid) {
      throw new Error(`Invalid secret name in ${context}: ${validation.error}`)
    }
  }
}
