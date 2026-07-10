export type PreparedCloudApply = () => Promise<void>

/**
 * Cloud write plans are JSON payloads. Clone and freeze them at prepare time so
 * later registry, source, or caller mutations cannot change the transaction
 * that was validated before the first write.
 */
export function freezePreparedPayload<T>(value: T): T {
  return freezeDeep(JSON.parse(JSON.stringify(value)) as T)
}

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value as Record<string, unknown>)) freezeDeep(nested)
  return Object.freeze(value)
}
