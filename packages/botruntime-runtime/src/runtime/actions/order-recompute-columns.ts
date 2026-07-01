type ColumnDefinition = {
  computed: boolean
  dependencies?: string[]
  value: (row: Record<string, unknown>) => Promise<unknown>
}

/**
 * Orders columns for recomputation based on their dependencies using topological sort.
 * Ensures that dependencies are computed before columns that depend on them.
 *
 * @param toRecompute - Array of column names that need to be recomputed
 * @param staleColumns - Set of column names that are currently stale (need recomputation)
 * @param columns - Record of all column definitions with their dependencies
 * @returns Array of column names in the order they should be computed
 *
 * @example
 * ```ts
 * // Column C depends on B, B depends on A
 * const columns = {
 *   a: { computed: true, dependencies: [], value: async (row) => row.base * 2 },
 *   b: { computed: true, dependencies: ['a'], value: async (row) => row.a + 10 },
 *   c: { computed: true, dependencies: ['b'], value: async (row) => row.b * 3 }
 * }
 *
 * const ordered = orderRecomputeColumns(['c'], new Set(['a', 'b', 'c']), columns)
 * // Result: ['a', 'b', 'c'] - dependencies computed first
 * ```
 */
export function orderRecomputeColumns(
  toRecompute: string[],
  staleColumns: Set<string>,
  columns: Record<string, ColumnDefinition>
): string[] {
  // Simple topological sort to order columns based on dependencies
  const ordered: string[] = []
  const visited: Set<string> = new Set()

  function visit(colName: string) {
    if (visited.has(colName)) return
    visited.add(colName)

    const deps = columns[colName]?.dependencies || []

    for (const dep of deps) {
      if (staleColumns.has(dep)) {
        visit(dep)
      }
    }

    if (staleColumns.has(colName) || toRecompute.includes(colName)) {
      ordered.push(colName)
    }
  }

  for (const col of toRecompute) {
    visit(col)
  }

  return ordered
}
