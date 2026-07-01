/**
 * Validates an event name according to ADK rules:
 * - Only alphanumeric characters (A-Z, a-z, 0-9) and underscores
 * - Maximum 100 characters
 * - Must start with a letter
 * - No special characters
 */
export function validateEventName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Event name must be a non-empty string' }
  }

  if (name.length > 100) {
    return { valid: false, error: `Event name "${name}" must be less than 100 characters` }
  }

  if (!/^[a-zA-Z]/.test(name)) {
    return { valid: false, error: `Event name "${name}" must start with a letter` }
  }

  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return {
      valid: false,
      error: `Event name "${name}" can only contain letters (A-Z, a-z), numbers (0-9), and underscores (_)`,
    }
  }

  return { valid: true }
}

/**
 * Validates all event names in an events definition object
 * Throws an error if any event name is invalid
 */
export function validateEventDefinitions(
  events: Record<string, { schema?: unknown; description?: string | undefined }>,
  context: string
): void {
  for (const eventName of Object.keys(events)) {
    const validation = validateEventName(eventName)
    if (!validation.valid) {
      throw new Error(`Invalid event name in ${context}: ${validation.error}`)
    }
  }
}
