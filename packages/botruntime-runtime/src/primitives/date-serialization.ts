/**
 * Deep date serialization utilities for workflow step data.
 *
 * When workflow step data is persisted, Date objects must be serialized to a format
 * that can be stored in JSON and later deserialized back to Date objects.
 *
 * This uses a special marker format: { __date__: ISO8601_STRING }
 */

const DATE_MARKER = '__date__' as const

interface DateMarker {
  [DATE_MARKER]: string
}

function isDateMarker(value: unknown): value is DateMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    DATE_MARKER in value &&
    typeof (value as Record<string, unknown>)[DATE_MARKER] === 'string'
  )
}

function isDate(value: unknown): value is Date {
  return value instanceof Date
}

/**
 * Deeply serialize Date objects in the input data structure.
 * Date objects are converted to { __date__: ISO8601_STRING } markers.
 *
 * @param data - The data to serialize
 * @returns The serialized data with Date objects converted to markers
 *
 * @example
 * const data = { timestamp: new Date('2024-01-01'), nested: { date: new Date() } }
 * const serialized = serializeDates(data)
 * // { timestamp: { __date__: '2024-01-01T00:00:00.000Z' }, nested: { date: { __date__: '...' } } }
 */
export function serializeDates<T>(data: T): T {
  // Handle null and undefined
  if (data === null || data === undefined) {
    return data
  }

  // Handle Date objects
  if (isDate(data)) {
    return { [DATE_MARKER]: data.toISOString() } as unknown as T
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => serializeDates(item)) as unknown as T
  }

  // Handle plain objects
  if (typeof data === 'object' && data.constructor === Object) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeDates(value)
    }
    return result as T
  }

  // Return primitives and other types as-is
  return data
}

/**
 * Deeply deserialize Date objects from the input data structure.
 * Converts { __date__: ISO8601_STRING } markers back to Date objects.
 *
 * @param data - The data to deserialize
 * @returns The deserialized data with markers converted back to Date objects
 *
 * @example
 * const serialized = { timestamp: { __date__: '2024-01-01T00:00:00.000Z' } }
 * const deserialized = deserializeDates(serialized)
 * // { timestamp: Date('2024-01-01T00:00:00.000Z') }
 */
export function deserializeDates<T>(data: T): T {
  // Handle null and undefined
  if (data === null || data === undefined) {
    return data
  }

  // Handle date markers
  if (isDateMarker(data)) {
    return new Date(data[DATE_MARKER]) as unknown as T
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => deserializeDates(item)) as unknown as T
  }

  // Handle plain objects
  if (typeof data === 'object' && data.constructor === Object) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      result[key] = deserializeDates(value)
    }
    return result as T
  }

  // Return primitives and other types as-is
  return data
}
