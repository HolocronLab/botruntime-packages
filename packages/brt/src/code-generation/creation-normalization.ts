export function normalizeCreation(value: unknown): { enabled: boolean; requiredTags: string[] } {
  if (!value || typeof value !== 'object') {
    return { enabled: false, requiredTags: [] }
  }
  const creation = value as { enabled?: unknown; requiredTags?: unknown }
  return {
    enabled: creation.enabled === true,
    requiredTags: Array.isArray(creation.requiredTags)
      ? creation.requiredTags.filter((tag): tag is string => typeof tag === 'string')
      : [],
  }
}
