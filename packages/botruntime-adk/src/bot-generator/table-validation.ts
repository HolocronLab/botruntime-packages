import { MAX_TABLE_COLUMNS } from '../constants.js'

export interface TableColumnViolation {
  name: string
  path: string
  columnCount: number
}

export interface ValidatableTable {
  path: string
  definition: {
    name: string
    schema?: { properties?: Record<string, unknown> }
  }
}

/**
 * Column count is read from the JSON Schema `properties` map. `BaseTable.getDefinition()`
 * produces a `TableDefinition` whose `schema` is the JSON-schema form of the column object;
 * each top-level property in `schema.properties` is one column.
 */
function getColumnCount(table: ValidatableTable): number {
  const properties = table.definition.schema?.properties
  return properties ? Object.keys(properties).length : 0
}

export function findTableColumnViolations(
  tables: ValidatableTable[],
  max: number = MAX_TABLE_COLUMNS
): TableColumnViolation[] {
  return tables
    .map((table) => ({
      name: table.definition.name,
      path: table.path,
      columnCount: getColumnCount(table),
    }))
    .filter((t) => t.columnCount > max)
}

export function formatTableColumnViolationError(
  violations: TableColumnViolation[],
  max: number = MAX_TABLE_COLUMNS
): string {
  const lines = violations.map((v) => `  - ${v.name} (${v.path}): ${v.columnCount} columns (max ${max})`)
  return [
    `Table column-count validation failed (limit: ${max} columns per table).`,
    'The following tables exceed the limit:',
    ...lines,
    'Reduce columns or split the table.',
  ].join('\n')
}
