export const DEFAULT_DEV_REQUEST_TIMEOUT_MS = 2 * 60 * 1000
export const MAX_DEV_REQUEST_TIMEOUT_MS = 2 * 60 * 1000

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  const normalized = value?.trim()
  if (!normalized || !/^\d+$/.test(normalized)) {
    return fallback
  }
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getConfiguredDevRequestTimeoutMs(
  value: string | undefined = process.env.ADK_DEV_REQUEST_TIMEOUT_MS
): number {
  return Math.min(parsePositiveInt(value, DEFAULT_DEV_REQUEST_TIMEOUT_MS), MAX_DEV_REQUEST_TIMEOUT_MS)
}
