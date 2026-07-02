import type { JSONSchema7 } from '@holocronlab/botruntime-zui'
import { z } from '@holocronlab/botruntime-sdk'

export interface ColumnDefinition {
  computed: boolean
  schema: z.ZodTypeAny
  dependencies?: string[]
  value?: (row: any) => Promise<any>
}

export interface LocalTable {
  name: string
  factor?: number
  schema: JSONSchema7
  isComputeEnabled?: boolean
  keyColumn?: string
  tags?: Record<string, string>
}

export interface RemoteTable {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  schema: JSONSchema7
  factor?: number
  keyColumn?: string
  tags?: Record<string, string>
}

export enum TableSyncOperation {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  None = 'none',
}

export interface ColumnChange {
  type: 'add' | 'remove' | 'modify' | 'rename'
  columnName: string
  oldColumnName?: string
  oldType?: string
  newType?: string
  details?: string
}

export interface TableSyncItem {
  operation: TableSyncOperation
  localTable?: LocalTable
  remoteTable?: RemoteTable
  reason: string
  differences?: string[]
  columnChanges?: ColumnChange[]
  schemaForUpdate?: JSONSchema7
}

export interface TableSyncPlan {
  items: TableSyncItem[]
  totalCreate: number
  totalUpdate: number
  totalDelete: number
  hasChanges: boolean
}

export interface TableSyncOptions {
  dryRun?: boolean
  bailOnFailure?: boolean
  confirmDestructive?: boolean
}

export interface TableSyncResult {
  applied: boolean
  success: TableSyncItem[]
  failed: Array<{
    item: TableSyncItem
    error: Error
  }>
  skipped: TableSyncItem[]
  summary: {
    created: number
    updated: number
    deleted: number
    skipped: number
    failed: number
  }
}
