import { CitationsManager } from '@holocronlab/botruntime-llmz'

/**
 * Recursively expands citations inline within any string property in an object
 * @param obj The object to process
 * @param citationsManager The CitationsManager instance to use for expansion
 * @returns A new object with citations expanded inline within strings
 */
export function expandCitationsInObject<T>(obj: T, citationsManager: CitationsManager): T {
  if (typeof obj === 'string' && obj.trim().length > 0) {
    // Expand citations inline within the string
    let footer = ''

    const { cleaned } = citationsManager.extractCitations(obj, (citation) => {
      // Return citation with expanded information appended
      footer += `${JSON.stringify(citation.source)}\n`
      return ''
    }) ?? { cleaned: obj }

    if (footer) {
      // Append the footer with all citations at the end
      return `${cleaned}\n\n${footer}`.trim() as T
    }

    return cleaned.trim() as T
  }

  if (Array.isArray(obj)) {
    // Process array elements recursively
    return obj.map((item) => expandCitationsInObject(item, citationsManager)) as T
  }

  if (obj && typeof obj === 'object') {
    // Process object properties recursively
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- building dynamic object
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandCitationsInObject(value, citationsManager)
    }
    return result
  }

  // Return primitive values as-is
  return obj
}
