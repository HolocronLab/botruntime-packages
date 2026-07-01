/**
 * Runtime Singletons
 *
 * This module provides a type-safe way to manage singleton instances across
 * multiple imports and bundling contexts. Each singleton is stored in globalThis
 * to ensure the same instance is shared even when the module is loaded multiple times.
 */

/**
 * Get or create a singleton instance from globalThis
 *
 * @example
 * const state = getSingleton('__ADK_GLOBAL_STATE', () => ({
 *   initialized: false,
 *   projectPath: undefined,
 * }));
 *
 * @example
 * const cache = getSingleton<Map<string, any>>('__ADK_GLOBAL_MY_CACHE', () => new Map());
 */
export function getSingleton<T>(key: `__ADK_GLOBAL_${string}`, factory: () => T): T {
  // oxlint-disable-next-line no-explicit-any -- globalThis requires any for dynamic key access
  if (!(globalThis as any)[key]) {
    // oxlint-disable-next-line no-explicit-any -- globalThis requires any for dynamic key access
    ;(globalThis as any)[key] = factory()
  }
  // oxlint-disable-next-line no-explicit-any -- globalThis requires any for dynamic key access
  return (globalThis as any)[key] as T
}
