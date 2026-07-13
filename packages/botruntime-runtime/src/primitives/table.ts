import { Definitions } from './definition'
import { Client, Table } from '@holocronlab/botruntime-client'
import { context } from '../runtime/context/context'
import { z } from '@holocronlab/botruntime-sdk'
import { Errors } from '../errors'

import { TableDefinitions } from '../_types/tables'
import type { TableRowMetadata, TableRowUpdateMetadata } from './table-row-metadata'

export type { TableRowMetadata, TableRowUpdateMetadata } from './table-row-metadata'

function isApiNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { isApiError?: unknown; code?: unknown; type?: unknown }
  return e.isApiError === true && (e.code === 404 || e.type === 'ResourceNotFound')
}

async function withTableNotFoundHint<T>(tableName: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (err) {
    if (isApiNotFoundError(err)) {
      const original = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Table '${tableName}' not found on the bot. This may indicate a table-definition error during deploy (for example, the table was skipped due to a schema violation such as too many columns). Original: ${original}`,
        { cause: err }
      )
    }
    throw err
  }
}

export namespace Typings {
  export type ColumnDefinition<
    TName extends string = string,
    TSchema extends z.ZodType = z.ZodType,
  > = TSchema extends z.ZodType
    ?
        | {
            computed: true
            searchable?: boolean
            schema: TSchema
            dependencies: ReadonlyArray<keyof TableDefinitions[TName]['Output']> // Array of column names
            value: (row: TableDefinitions[TName]['Output']) => Promise<z.output<TSchema>>
          }
        | {
            computed?: false
            searchable?: boolean
            schema: TSchema
          }
    : never

  export type Props<TName extends string = string> = {
    name: TName
    description?: string
    factor?: number
    columns: Record<string, ColumnDefinition<TName> | z.ZodType>
    keyColumn?: keyof TableDefinitions[TName]['Output']
    tags?: Record<string, string>
  }

  export const Primitive = 'table' as const
}

// Type to extract nested keys up to 3 levels deep
type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T & string]:
        | K
        | (T[K] extends (infer U)[]
            ? K | `${K}.${number}` | (U extends object ? `${K}.${number}.${NestedKeyOf<U>}` : never)
            : T[K] extends object
              ? K | `${K}.${NestedKeyOf<T[K]>}`
              : K)
    }[keyof T & string]
  : never

// Filter types for table queries
export type PrimitiveFilter<T> = {
  $eq?: T
  $gt?: T
  $gte?: T
  $lt?: T
  $lte?: T
  $ne?: T
  $in?: T[]
  $nin?: T[]
  $exists?: boolean
  $regex?: string
  $options?: 'i' | 'c' // 'i' for case-insensitive, 'c' for case-sensitive
}

export type LogicalFilter<TColumns, TName extends string = string> = {
  $and?: TableFilter<TColumns, TName>[]
  $or?: TableFilter<TColumns, TName>[]
  $not?: TableFilter<TColumns, TName>
}

// Enhanced filter that provides autocomplete for nested paths
export type TableFilter<TColumns, TName extends string = string> = {
  [K in keyof TColumns]?: TColumns[K] | PrimitiveFilter<TColumns[K]>
} & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in NestedKeyOf<TColumns>]?: any | PrimitiveFilter<any>
} & LogicalFilter<TColumns, TName>

export type OrderDirection = 'asc' | 'desc'

// Aggregation operations available for different column types
type NumberAggregations = 'key' | 'count' | 'sum' | 'avg' | 'max' | 'min' | 'unique'
type StringAggregations = 'key' | 'count' | 'max' | 'min' | 'unique'
type DateAggregations = 'key' | 'count' | 'max' | 'min' | 'unique'
type BooleanAggregations = 'key' | 'count' | 'unique'
type ArrayAggregations = 'key' | 'count' | 'unique'
type ObjectAggregations = 'key' | 'count' | 'unique'

// Map column types to their available aggregations
type GetAggregations<T> = T extends number
  ? NumberAggregations
  : T extends string
    ? StringAggregations
    : T extends Date
      ? DateAggregations
      : T extends boolean
        ? BooleanAggregations
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          T extends any[]
          ? ArrayAggregations
          : T extends object
            ? ObjectAggregations
            : 'key' | 'count' | 'unique'

// Extract the type at a given path in an object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GetTypeAtPath<T, Path> = Path extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? GetTypeAtPath<T[K], Rest>
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
  : Path extends keyof T
    ? T[Path]
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any

// Type for group parameter - supports single operation or array of operations
export type TableGroup<TColumns> = {
  [K in NestedKeyOf<TColumns>]?:
    | GetAggregations<GetTypeAtPath<TColumns, K>>
    | GetAggregations<GetTypeAtPath<TColumns, K>>[]
}

// Helper to convert path.to.field to pathToField (camelCase)
type CamelCasePath<S extends string> = S extends `${infer A}.${infer B}` ? `${A}${Capitalize<CamelCasePath<B>>}` : S

// Generate aggregated field names based on operation
type AggregatedFieldName<Path extends string, Op extends string> = Op extends 'key'
  ? `${CamelCasePath<Path>}Key`
  : `${CamelCasePath<Path>}${Capitalize<Op>}`

// Map aggregation result types
type AggregationResultType<T, Op extends string> = Op extends 'count'
  ? number
  : Op extends 'sum'
    ? number
    : Op extends 'avg'
      ? number
      : Op extends 'max'
        ? T
        : Op extends 'min'
          ? T
          : Op extends 'unique'
            ? T[]
            : Op extends 'key'
              ? T
              : never

// Generate result shape from group configuration
type GroupResultShape<TColumns, TGroup> =
  TGroup extends TableGroup<TColumns>
    ? {
        [K in keyof TGroup as TGroup[K] extends string
          ? AggregatedFieldName<K & string, TGroup[K]>
          : TGroup[K] extends readonly string[]
            ? TGroup[K][number] extends string
              ? AggregatedFieldName<K & string, TGroup[K][number]>
              : never
            : never]: TGroup[K] extends string
          ? AggregationResultType<GetTypeAtPath<TColumns, K & string>, TGroup[K]>
          : TGroup[K] extends readonly string[]
            ? TGroup[K][number] extends string
              ? AggregationResultType<GetTypeAtPath<TColumns, K & string>, TGroup[K][number]>
              : never
            : never
      }
    : never

export interface FindRowsOptions<TName extends string> {
  filter?: TableFilter<TableDefinitions[TName]['Input'], TName>
  orderBy?: keyof TableDefinitions[TName]['Output']
  orderDirection?: OrderDirection
  limit?: number
  offset?: number
  search?: string
  group?: TableGroup<TableDefinitions[TName]['Output']> // Type-safe group parameter
}

type Row<Shape> = TableRowMetadata & Shape

type SearchResult<Shape> = TableRowMetadata & {
  similarity: number
} & Shape

export class BaseTable<TName extends string = string> implements Definitions.Primitive {
  public readonly name: TName
  public readonly description?: string
  public readonly factor: number
  public readonly columns: Record<string, Typings.ColumnDefinition<TName>>
  public readonly schema: z.ZuiObjectSchema
  public readonly type: Definitions.PrimitiveDefinition['type'] = 'table'
  public readonly keyColumn?: string
  public readonly tags?: Record<string, string>

  public readonly nullableColumns: Set<string> = new Set()
  public readonly searchableColumns: Set<string> = new Set()
  public readonly computedColumns: Set<string> = new Set()

  private get client(): Client {
    return context.get('client') as unknown as Client
  }

  constructor(props: Typings.Props<TName>) {
    // Validate table name
    const tableNameSchema = z
      .string()
      .min(1)
      .refine((name) => !z.string().uuid().safeParse(name).success, 'Table name cannot be a UUID')
      .refine(
        (name) => /^[a-zA-Z_$][a-zA-Z0-9_]{0,29}Table$/.test(name),
        "Table name must start with a letter/underscore, be 35 chars or less, contain only letters/numbers/underscores, and end with 'Table'"
      )

    const tagsSchema = z.record(z.string().min(3).max(50), z.string().min(1).max(255)).optional()

    const validation = tableNameSchema.safeParse(props.name)
    if (!validation.success) {
      throw new Errors.InvalidPrimitiveError(`Invalid table name '${props.name}'`, validation.error)
    }

    this.name = props.name as TName
    if (props.description !== undefined) {
      this.description = props.description
    }

    if (props.factor !== undefined && (props.factor < 1 || props.factor > 30)) {
      throw new Errors.InvalidPrimitiveError(
        `Invalid factor for table '${props.name}': must be between 1 and 30 but got ${props.factor}`
      )
    }

    this.factor = props.factor ?? 1

    if (props.tags !== undefined) {
      const parsed = tagsSchema.safeParse(props.tags)
      if (!parsed.success) {
        throw new Errors.InvalidPrimitiveError(`Invalid tags for table '${props.name}'`, parsed.error)
      }
      this.tags = props.tags
    }

    // Normalize columns to always be ColumnDefinition format
    this.columns = {}
    let schema = z.object({})

    for (const [key, value] of Object.entries(props.columns)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const val = value as any
      if (val && typeof val === 'object' && 'schema' in val) {
        let property = val.schema as z.ZodTypeAny

        const isComputed = val.computed === true
        if (isComputed) {
          this.computedColumns.add(key)
        }

        property.setMetadata({
          searchable: val.searchable ?? false,
          computed: isComputed
            ? {
                dependencies: val.dependencies?.map(String) || [],
                action: 'code',
                code: val.value ? val.value.toString() : 'async () => {}',
              }
            : undefined,
        })

        if (isComputed || property.isNullable() || property.isOptional()) {
          this.nullableColumns.add(key)
          property = property.naked()
          property = property.optional()
        }

        schema = schema.extend({ [key]: property })

        // Already in long form - ensure searchable has a default
        this.columns[key] = {
          computed: val.computed ?? false,
          searchable: val.searchable ?? false,
          schema: val.schema,
          ...(val.dependencies && { dependencies: val.dependencies }),
          ...(val.value && { value: val.value }),
        } as Typings.ColumnDefinition<TName>
      } else {
        // TODO: fix nullables here
        let property = val as z.ZodTypeAny
        property.setMetadata({
          searchable: false,
        })

        if (property.isNullable() || property.isOptional()) {
          this.nullableColumns.add(key)
          property = property.naked()
          property = property.optional()
        }

        schema = schema.extend({ [key]: property })

        // Short form - just a schema
        this.columns[key] = {
          computed: false,
          searchable: false,
          schema: val as z.ZodTypeAny,
        } as unknown as Typings.ColumnDefinition<TName>
      }
    }

    // Validate column names against reserved system columns
    const reservedColumns = ['id', 'rowVersion', 'createdAt', 'updatedAt']
    const conflicting = Object.keys(this.columns).filter((col) => reservedColumns.includes(col))
    if (conflicting.length > 0) {
      throw new Errors.InvalidPrimitiveError(
        `Table '${props.name}' uses reserved column name(s): ${conflicting.join(', ')}. These columns are automatically managed by the system. Reserved names: ${reservedColumns.join(', ')}`
      )
    }

    if (props.keyColumn) {
      if (typeof props.keyColumn !== 'string' || !(props.keyColumn in this.columns)) {
        throw new Errors.InvalidPrimitiveError(
          `Invalid keyColumn '${String(props.keyColumn)}' for table '${props.name}': column does not exist`
        )
      }

      this.keyColumn = String(props.keyColumn)
    }

    this.schema = schema as unknown as z.ZuiObjectSchema
  }

  /** @internal */
  public getDefinition(): Definitions.TableDefinition {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = z.transforms.toJSONSchemaLegacy(this.schema as any)

    for (const col of Object.keys(this.columns)) {
      if (this.computedColumns.has(col) || this.nullableColumns.has(col)) {
        if (
          'properties' in schema &&
          schema.properties &&
          col in schema.properties &&
          typeof schema.properties[col] === 'object' &&
          schema.properties[col] !== null
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(schema.properties[col] as any).nullable = true
        }
        if ('required' in schema && Array.isArray(schema.required)) {
          schema.required = schema.required.filter((x) => x !== col)
        }
      }
    }

    const definition: Definitions.TableDefinition = {
      type: 'table',
      name: this.name,
      schema,
      factor: this.factor,
      keyColumn: this.keyColumn!,
      tags: this.tags!,
    }

    if (this.description !== undefined) {
      definition.description = this.description
    }

    return definition
  }

  async getRow(props: { id: number }): Promise<Row<TableDefinitions[TName]['Output']>> {
    const { row } = await withTableNotFoundHint(this.name, () =>
      this.client.getTableRow({
        table: this.name,
        id: props.id,
      })
    )

    return row as Row<TableDefinitions[TName]['Output']>
  }

  async findRows<TOptions extends FindRowsOptions<TName>>(
    options: TOptions = {} as TOptions
  ): Promise<{
    rows: TOptions['group'] extends TableGroup<TableDefinitions[TName]['Output']>
      ? GroupResultShape<TableDefinitions[TName]['Output'], TOptions['group']>[]
      : SearchResult<TableDefinitions[TName]['Output']>[]
    hasMore: boolean
    limit: number
    offset: number
  }> {
    const {
      filter = undefined!,
      orderBy = undefined!,
      orderDirection = undefined!,
      limit = undefined!,
      offset = undefined!,
      search = undefined!,
      group = undefined!,
    } = options

    const result = await withTableNotFoundHint(this.name, () =>
      this.client.findTableRows({
        table: this.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filter: filter as any,
        group,
        limit,
        offset,
        ...(orderBy && { orderBy: String(orderBy) }),
        orderDirection,
        ...(search && { search }),
      })
    )

    return {
      rows: result.rows as Row<TableDefinitions[TName]['Output']>[],
      hasMore: result.hasMore || false,
      limit: result.limit,
      offset: result.offset,
    }
  }

  async createRows({
    rows,
    waitComputed,
  }: {
    rows: TableDefinitions[TName]['Input'][]
    waitComputed?: boolean
  }): Promise<{
    rows: Row<TableDefinitions[TName]['Output']>[]
    errors?: string[]
    warnings?: string[]
  }> {
    const result = await withTableNotFoundHint(this.name, () =>
      this.client.createTableRows({
        table: this.name,
        waitComputed: waitComputed || false,
        rows,
      })
    )
    return result as {
      rows: Row<TableDefinitions[TName]['Output']>[]
      errors?: string[]
      warnings?: string[]
    }
  }

  async deleteAllRows(): Promise<{ deletedRows: number }> {
    return await withTableNotFoundHint(this.name, () =>
      this.client.deleteTableRows({
        deleteAllRows: true,
        table: this.name,
      })
    )
  }

  async deleteRowIds(ids: number[]): Promise<{ deletedRows: number }> {
    return await withTableNotFoundHint(this.name, () =>
      this.client.deleteTableRows({
        table: this.name,
        ids,
      })
    )
  }

  async deleteRows(filter: FindRowsOptions<TName>['filter']): Promise<{ deletedRows: number }> {
    return await withTableNotFoundHint(this.name, () =>
      this.client.deleteTableRows({
        table: this.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filter: filter as any,
      })
    )
  }

  async updateRows(props: {
    rows: (Partial<TableDefinitions[TName]['Input']> & TableRowUpdateMetadata)[]
    waitComputed?: boolean
  }): Promise<{
    rows: Row<TableDefinitions[TName]['Output']>[]
    errors?: string[]
    warnings?: string[]
  }> {
    const result = await withTableNotFoundHint(this.name, () =>
      this.client.updateTableRows({
        table: this.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows: props.rows as any,
        waitComputed: props.waitComputed || false,
      })
    )

    return {
      rows: result.rows as Row<TableDefinitions[TName]['Output']>[],
      errors: result.errors!,
      warnings: result.warnings!,
    }
  }

  async upsertRows(props: {
    rows: (Partial<TableDefinitions[TName]['Input']> & {
      id?: number
      rowVersion?: number
    })[]
    waitComputed?: boolean
    // `Output` (not `Input`) so the system `id` — the runtime default — is a valid key.
    keyColumn?: keyof TableDefinitions[TName]['Output']
  }): Promise<{
    updated: Row<TableDefinitions[TName]['Output']>[]
    inserted: Row<TableDefinitions[TName]['Output']>[]
    errors?: string[]
    warnings?: string[]
  }> {
    const result = await withTableNotFoundHint(this.name, () =>
      this.client.upsertTableRows({
        table: this.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows: props.rows as any,
        waitComputed: props.waitComputed || false,
        keyColumn: (props.keyColumn ?? 'id') as string,
      })
    )

    return {
      inserted: result.inserted as Row<TableDefinitions[TName]['Output']>[],
      updated: result.updated as Row<TableDefinitions[TName]['Output']>[],
      errors: result.errors!,
      warnings: result.warnings!,
    }
  }

  async getTable(): Promise<{
    rows: number
    stale: number
    indexing: number
    table: Table
  }> {
    const result = await withTableNotFoundHint(this.name, () =>
      this.client.getTable({
        table: this.name,
      })
    )
    return {
      rows: result.rows,
      stale: result.stale,
      indexing: result.indexing,
      table: result.table,
    }
  }
}

// Legacy export for backwards compatibility
export { BaseTable as Table }
