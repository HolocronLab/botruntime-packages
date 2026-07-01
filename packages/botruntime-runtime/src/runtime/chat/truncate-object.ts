/**
 * Deep truncation of objects to fit within a character limit
 */

export function truncateObject(value: unknown, maxChars: number): { result: unknown; size: number } {
  let currentSize = 0

  function truncateValue(val: unknown): unknown {
    if (currentSize >= maxChars) {
      return undefined
    }

    // Handle primitives
    if (val === null || val === undefined) {
      const size = 4 // "null" or "undefined" in JSON
      currentSize += size
      return val
    }

    if (typeof val === 'boolean') {
      const size = val ? 4 : 5 // "true" or "false"
      currentSize += size
      return val
    }

    if (typeof val === 'number') {
      const size = String(val).length
      currentSize += size
      return val
    }

    if (typeof val === 'string') {
      const availableChars = maxChars - currentSize
      if (availableChars <= 0) {
        return undefined
      }

      if (val.length <= availableChars) {
        currentSize += val.length
        return val
      }

      // Truncate string
      const truncated = val.slice(0, availableChars)
      currentSize += truncated.length
      return truncated
    }

    // Handle arrays
    if (Array.isArray(val)) {
      currentSize += 2 // "[]"
      const result: unknown[] = []

      for (let i = 0; i < val.length; i++) {
        if (currentSize >= maxChars) {
          break
        }

        if (i > 0) {
          currentSize += 1 // comma separator
        }

        const truncated = truncateValue(val[i])
        if (truncated !== undefined || val[i] === undefined) {
          result.push(truncated)
        } else {
          break
        }
      }

      return result
    }

    // Handle objects
    if (typeof val === 'object') {
      currentSize += 2 // "{}"
      const result: Record<string, unknown> = {}

      const entries = Object.entries(val)
      for (let i = 0; i < entries.length; i++) {
        if (currentSize >= maxChars) {
          break
        }

        const [key, value] = entries[i]!

        if (i > 0) {
          currentSize += 1 // comma separator
        }

        // Add key size (with quotes and colon)
        const keySize = key.length + 3 // "key":
        if (currentSize + keySize >= maxChars) {
          break
        }
        currentSize += keySize

        const truncatedValue = truncateValue(value)
        if (truncatedValue !== undefined || value === undefined) {
          result[key] = truncatedValue
        }
      }

      return result
    }

    // Unknown type, convert to string
    const str = String(val)
    const availableChars = maxChars - currentSize
    if (availableChars <= 0) {
      return undefined
    }

    if (str.length <= availableChars) {
      currentSize += str.length
      return str
    }

    const truncated = str.slice(0, availableChars)
    currentSize += truncated.length
    return truncated
  }

  const result = truncateValue(value)
  return { result, size: currentSize }
}

/**
 * Calculate the approximate character size of a value when serialized to JSON
 */
export function getSerializedSize(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    return String(value).length
  }
}
