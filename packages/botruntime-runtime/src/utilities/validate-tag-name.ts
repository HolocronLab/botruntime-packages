/**
 * Validates a tag name according to ADK rules:
 * - Only alphanumeric characters (A-Z, a-z, 0-9) and underscores
 * - Minimum 3 characters
 * - Must start with a letter
 */
export function validateTagName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Tag name must be a non-empty string' }
  }

  if (name.length < 3) {
    return { valid: false, error: `Tag name "${name}" must be at least 3 characters long` }
  }

  if (!/^[a-zA-Z]/.test(name)) {
    return { valid: false, error: `Tag name "${name}" must start with a letter` }
  }

  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return {
      valid: false,
      error: `Tag name "${name}" can only contain letters (A-Z, a-z), numbers (0-9), and underscores (_)`,
    }
  }

  return { valid: true }
}

/**
 * Validates all tag names in a tag definition object
 * Throws an error if any tag name is invalid
 */
export function validateTagDefinitions(
  tags: Record<string, { title: string; description?: string | undefined }>,
  context: string
): void {
  for (const tagName of Object.keys(tags)) {
    const validation = validateTagName(tagName)
    if (!validation.valid) {
      throw new Error(`Invalid tag name in ${context}: ${validation.error}`)
    }
  }
}
