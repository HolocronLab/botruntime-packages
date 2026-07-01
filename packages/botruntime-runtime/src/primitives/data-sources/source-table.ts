import { DataSource, createSyncWorkflow } from './source-base'
import type { ExtraFileTags } from './source-base'
import { BaseTable } from '../table'
import { z } from '@holocronlab/botruntime-sdk'

type TableRow = {
  id: number
  createdAt: string
  updatedAt: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

type TableSourceOptions<TRow extends TableRow = TableRow> = {
  id?: string
  transform?: (context: { row: TRow; content: string }) => string | Promise<string>
  /**
   * Extra tags applied to every file ingested by this source, on top of the
   * well-known KB/source identity tags. Reserved keys are ignored.
   */
  tags?: ExtraFileTags
}

export class TableSource<TRow extends TableRow = TableRow> extends DataSource {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly table: BaseTable<any>
  private _transformFn: ((context: { row: TRow; content: string }) => string | Promise<string>) | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(id: string, table: BaseTable<any>, options: TableSourceOptions<TRow> = {}) {
    super(id, 'table', { tags: options.tags })
    this.table = table
    this._transformFn = options.transform ?? undefined
  }

  /** Get the transform function for this source */
  protected get transformFn(): ((context: { row: TRow; content: string }) => string | Promise<string>) | undefined {
    return this._transformFn
  }

  /** Get serializable configuration for change detection */
  public getConfig(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      tableName: this.table.name,
      transformFn: this.transformFn?.toString() || null,
    }
  }

  public get syncWorkflow() {
    return createSyncWorkflow({
      type: 'table' as const,
      state: z.object({ offset: z.number().default(0) }),
      handler: async () => {
        throw new Error('TableSource synchronization not implemented')
      },
    })
  }

  static fromTable<TRow extends TableRow = TableRow>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: BaseTable<any>,
    options: TableSourceOptions<TRow> = {}
  ): TableSource<TRow> {
    const id = options.id || `table_${table.name}`
    return new TableSource(id, table, options)
  }
}
