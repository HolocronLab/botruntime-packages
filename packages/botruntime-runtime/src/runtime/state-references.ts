/**
 * State Reference System
 *
 * Provides automatic serialization and deserialization of object references in state.
 * This allows storing complex objects (WorkflowInstance, ConversationInstance, etc.)
 * in state without actually persisting the full object.
 *
 * Objects that support state references must implement the StateReference symbol.
 */

import { StateReference, type StateReferenceable } from './state-reference-symbol'

export { StateReference, type StateReferenceable }

/**
 * Type for a serialized state reference
 */
export type SerializedReference = {
  __ref__: string // Type of reference (e.g., 'workflow', 'conversation', 'message')
  id: string // ID to load the reference
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any // Additional metadata
}

// Configuration
const MAX_REFERENCES_PER_STATE = 100
const LOAD_WARNING_THRESHOLD_MS = 2000
const CONCURRENT_LOAD_LIMIT = 10

/**
 * Check if a value is a serialized reference
 */
function isSerializedReference(value: unknown): value is SerializedReference {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__ref__' in value &&
    typeof value.__ref__ === 'string' &&
    'id' in value &&
    typeof value.id === 'string'
  )
}

/**
 * Check if an object implements the StateReference symbol
 */
function isStateReferenceable(value: unknown): value is StateReferenceable {
  return (
    value !== null &&
    typeof value === 'object' &&
    StateReference in value &&
    typeof value[StateReference] === 'function'
  )
}

/**
 * Recursively serialize all state-referenceable objects to references
 *
 * @param value - The value to serialize
 * @param seen - WeakSet to track circular references
 * @returns Serialized value with references replaced
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeStateReferences(value: any, seen = new WeakSet()): any {
  // Handle primitives and null/undefined
  if (value === null || value === undefined || typeof value !== 'object') {
    return value
  }

  // Check if this object implements StateReference
  // Do this BEFORE checking seen to ensure same instance is serialized every time
  if (isStateReferenceable(value)) {
    return value[StateReference]()
  }

  // Check for circular references (after StateReference check)
  if (seen.has(value)) {
    return value
  }
  seen.add(value)

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => serializeStateReferences(item, seen))
  }

  // Handle plain objects
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value)) {
    result[key] = serializeStateReferences(val, seen)
  }
  return result
}

/**
 * Collect all references from a value
 */
function collectReferences(
  value: unknown,
  refs: Array<{ path: string[]; ref: SerializedReference }> = [],
  currentPath: string[] = [],
  seen = new WeakSet<object>()
): Array<{ path: string[]; ref: SerializedReference }> {
  if (value === null || value === undefined || typeof value !== 'object') {
    return refs
  }

  if (seen.has(value)) {
    return refs
  }
  seen.add(value)

  // Check if this is a reference
  if (isSerializedReference(value)) {
    refs.push({ path: [...currentPath], ref: value })
    return refs
  }

  // Recursively collect from arrays
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectReferences(value[i], refs, [...currentPath, String(i)], seen)
    }
  }
  // Recursively collect from objects
  else {
    for (const [key, val] of Object.entries(value)) {
      collectReferences(val, refs, [...currentPath, key], seen)
    }
  }

  return refs
}

/**
 * Load a reference based on its type
 */
async function loadReference(ref: SerializedReference): Promise<unknown> {
  switch (ref.__ref__) {
    case 'workflow': {
      // Dynamic import to avoid circular dependency
      const { BaseWorkflowInstance } = await import('../primitives/workflow-instance')
      return BaseWorkflowInstance.load({ id: ref.id })
    }
    // Add more reference types here as needed:
    // case 'conversation': return loadConversation(ref.id)
    // case 'message': return loadMessage(ref.id)
    default:
      console.warn(`Unknown reference type: ${ref.__ref__}. Keeping as serialized reference.`)
      return ref
  }
}

/**
 * Stable key identifying a unique referenceable object.
 * References sharing a key resolve to the same backend object, so they are
 * loaded once and fanned out to every path that points at them.
 */
function referenceKey(ref: SerializedReference): string {
  return `${ref.__ref__}:${ref.id}`
}

/**
 * Load a set of unique references with concurrency limiting, using
 * Promise.allSettled in batches.
 *
 * @param uniqueRefs - One entry per distinct reference (already deduplicated)
 * @param limit - Maximum concurrent loads
 * @returns Map from {@link referenceKey} to the settled load result
 */
async function loadReferencesWithLimit(
  uniqueRefs: SerializedReference[],
  limit: number
): Promise<Map<string, PromiseSettledResult<unknown>>> {
  const results = new Map<string, PromiseSettledResult<unknown>>()

  // Process in batches
  for (let i = 0; i < uniqueRefs.length; i += limit) {
    const batch = uniqueRefs.slice(i, i + limit)
    const batchResults = await Promise.allSettled(batch.map((ref) => loadReference(ref)))

    for (let j = 0; j < batch.length; j++) {
      results.set(referenceKey(batch[j]!), batchResults[j]!)
    }
  }

  return results
}

/**
 * Set a value at a given path in an object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setAtPath(obj: any, path: string[], value: unknown): void {
  if (path.length === 0) return

  let current = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!key) continue
    if (!(key in current)) {
      current[key] = {}
    }
    current = current[key]
  }

  const lastKey = path[path.length - 1]
  if (lastKey !== undefined) {
    current[lastKey] = value
  }
}

/**
 * Recursively deserialize all state references by loading the actual objects
 *
 * @param value - The value to deserialize
 * @throws Error if too many references or loading takes too long
 */
export async function deserializeStateReferences(value: unknown): Promise<void> {
  if (value === null || value === undefined || typeof value !== 'object') {
    return
  }

  const startTime = Date.now()

  // Collect all references with their paths. Multiple paths may point at the
  // same backend object (e.g. an append-only history that lists the same
  // workflow twice).
  const refs = collectReferences(value)

  if (refs.length === 0) {
    return // No references to load
  }

  // Deduplicate by referenceKey: one load per distinct object, with every
  // path that points at it recorded so the resolved value can be fanned out.
  const uniqueRefs = new Map<string, { ref: SerializedReference; paths: string[][] }>()
  for (const { path, ref } of refs) {
    const key = referenceKey(ref)
    const existing = uniqueRefs.get(key)
    if (existing) {
      existing.paths.push(path)
    } else {
      uniqueRefs.set(key, { ref, paths: [path] })
    }
  }

  // The cap counts distinct references, not duplicate occurrences: storing the
  // same object N times costs one load, so it should not count N times here.
  const uniqueCount = uniqueRefs.size
  if (uniqueCount > MAX_REFERENCES_PER_STATE) {
    throw new Error(
      `State contains ${uniqueCount} distinct references, which exceeds the maximum allowed (${MAX_REFERENCES_PER_STATE}). ` +
        `Consider restructuring your state to use fewer references or store data in Tables instead.`
    )
  }

  // Load each distinct reference once, in parallel with a concurrency limit.
  const results = await loadReferencesWithLimit(
    [...uniqueRefs.values()].map((entry) => entry.ref),
    CONCURRENT_LOAD_LIMIT
  )

  // Fan each resolved value out to every path that referenced it.
  for (const [key, { ref, paths }] of uniqueRefs) {
    const result = results.get(key)
    if (result?.status === 'fulfilled') {
      for (const path of paths) {
        setAtPath(value, path, result.value)
      }
    } else {
      console.error(`Failed to load reference ${ref.__ref__}:${ref.id}:`, result?.reason)
      // Keep the serialized reference in place at every path if loading fails.
    }
  }

  const loadTime = Date.now() - startTime

  if (loadTime > LOAD_WARNING_THRESHOLD_MS) {
    console.warn(
      `Loading ${uniqueCount} distinct state references took ${loadTime}ms, which exceeds the threshold of ${LOAD_WARNING_THRESHOLD_MS}ms. ` +
        `Consider reducing the number of references in state for better performance.`
    )
  }
}
