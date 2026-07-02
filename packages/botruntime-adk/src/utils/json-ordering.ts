/**
 * Utility for ensuring consistent key ordering in JSON files
 */

// Key ordering arrays for different file types
export const agentInfoKeyOrder = ['botId', 'workspaceId', 'apiUrl'] as const
export const agentLocalInfoKeyOrder = ['botId', 'workspaceId', 'apiUrl', 'devId'] as const
export const dependenciesKeyOrder = ['integrations'] as const
export const integrationKeyOrder = ['version', 'enabled', 'configurationType', 'config'] as const

/**
 * Orders object keys according to a specified order, with unspecified keys at the end alphabetically
 */
export function orderKeys<T extends Record<string, unknown>>(obj: T, keyOrder?: readonly (keyof T)[]): T {
  const objKeys = Object.keys(obj)
  const orderedKeys: string[] = []
  const remainingKeys: string[] = []

  // Add keys in the specified order if they exist in the object
  if (keyOrder) {
    for (const key of keyOrder) {
      const keyStr = String(key)
      if (objKeys.includes(keyStr)) {
        orderedKeys.push(keyStr)
      }
    }
  }

  // Add remaining keys alphabetically
  for (const key of objKeys) {
    if (!orderedKeys.includes(key)) {
      remainingKeys.push(key)
    }
  }
  remainingKeys.sort()

  // Combine ordered keys with remaining keys
  const finalKeys = [...orderedKeys, ...remainingKeys]

  const result = {} as T
  for (const key of finalKeys) {
    result[key as keyof T] = obj[key] as T[keyof T]
  }

  return result
}

/**
 * Recursively orders keys in nested objects for integrations
 */
export function orderIntegrationKeys(integrations: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [name, config] of Object.entries(integrations)) {
    if (typeof config === 'object' && config !== null && !Array.isArray(config)) {
      result[name] = orderKeys(config as Record<string, unknown>, integrationKeyOrder)
    } else {
      result[name] = config
    }
  }

  return result
}

/**
 * Stringifies JSON with consistent key ordering and formatting
 */
export function stringifyWithOrder<T extends Record<string, unknown>>(
  obj: T,
  keyOrder?: readonly (keyof T)[],
  space: number | string = 2
): string {
  const orderedObj = orderKeys(obj, keyOrder)

  // Special handling for dependencies with nested integrations
  if ('integrations' in orderedObj) {
    const integrations = (orderedObj as Record<string, unknown>).integrations
    if (integrations && typeof integrations === 'object') {
      ;(orderedObj as Record<string, unknown>).integrations = orderIntegrationKeys(
        integrations as Record<string, unknown>
      )
    }
  }

  return JSON.stringify(orderedObj, null, space)
}
