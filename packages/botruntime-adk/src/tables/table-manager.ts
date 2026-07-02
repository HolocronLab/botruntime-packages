import type { Client } from '@holocronlab/botruntime-client'
import { z } from '@holocronlab/botruntime-sdk'
import { AdkError } from '@holocronlab/botruntime-analytics'
import type { JSONSchema7 } from '@holocronlab/botruntime-zui'

import { AgentProject } from '../agent-project/agent-project.js'

const { transforms } = z
import { getProjectClient, type Credentials } from '../auth/index.js'
import {
  ColumnChange,
  LocalTable,
  RemoteTable,
  TableSyncItem,
  TableSyncOperation,
  TableSyncOptions,
  TableSyncPlan,
  TableSyncResult,
} from './types.js'

export interface TableManagerOptions {
  project: AgentProject
  botId?: string
  credentials?: Credentials
}

export class TableManager {
  private client?: Client
  private botId?: string
  private project: AgentProject
  private credentials?: Credentials

  constructor(options: TableManagerOptions) {
    this.botId = options.botId
    this.project = options.project
    this.credentials = options.credentials
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      this.assertBotId('initialize client')
      this.client = await getProjectClient({
        project: this.project,
        credentials: this.credentials,
        botId: this.botId,
        headers: {
          'x-multiple-integrations': 'true',
        },
      })
    }
    return this.client
  }

  private assertBotId(operation: string): void {
    if (!this.botId) {
      throw new AdkError({
        code: 'BOT_ID_REQUIRED',
        expected: true,
        message:
          `Operation "${operation}" requires a bot ID. ` +
          'Please deploy your agent first or create agent.json with botId and workspaceId.',
        suggestion: 'Deploy your agent first or create agent.json with botId and workspaceId.',
      })
    }
  }

  private getSchemaType(schema: Record<string, unknown>): string {
    if (schema.type) {
      const items = schema.items as Record<string, unknown> | undefined
      if (schema.type === 'array' && items?.type) {
        return `array<${items.type}>`
      }
      return String(schema.type)
    }
    if (schema.$ref) {
      return String(schema.$ref).split('/').pop() || 'unknown'
    }
    return 'unknown'
  }

  /** Remove automatically generated properties that we can ignore when comparing changes */
  private calculateRenameScore(
    oldSchema: Record<string, unknown>,
    newSchema: Record<string, unknown>,
    oldPosition: number,
    newPosition: number
  ): number {
    let score = 0

    // Same position in schema (strong signal) +3
    if (oldPosition === newPosition) {
      score += 3
    } else if (Math.abs(oldPosition - newPosition) <= 1) {
      // Adjacent position +1
      score += 1
    }

    // Compare descriptions
    const oldDesc = String(oldSchema?.description || '').toLowerCase()
    const newDesc = String(newSchema?.description || '').toLowerCase()

    if (oldDesc && newDesc && oldDesc === newDesc) {
      // Exact description match (very strong signal) +5
      score += 5
    } else if (oldDesc && newDesc && oldDesc.length > 5 && newDesc.length > 5) {
      // Partial description match +2
      if (oldDesc.includes(newDesc) || newDesc.includes(oldDesc)) {
        score += 2
      } else {
        // Check for word overlap
        const oldWords = oldDesc.split(/\s+/)
        const newWords = newDesc.split(/\s+/)
        const commonWords = oldWords.filter((w: string) => newWords.includes(w) && w.length > 3)
        if (commonWords.length >= 2) {
          score += 1
        }
      }
    }

    // Same required/optional status +1
    const oldType = oldSchema?.type
    const newType = newSchema?.type
    const oldOptional = (typeof oldType === 'string' && oldType.includes('null')) || oldSchema?.nullable === true
    const newOptional = (typeof newType === 'string' && newType.includes('null')) || newSchema?.nullable === true
    if (oldOptional === newOptional) {
      score += 1
    }

    // Same searchable status +1
    // The API doesn't persist x-zui.searchable, so treat undefined remote as a match
    const oldSearchable = (oldSchema?.['x-zui'] as Record<string, unknown> | undefined)?.searchable
    const newSearchable = (newSchema?.['x-zui'] as Record<string, unknown> | undefined)?.searchable
    if (oldSearchable === undefined || oldSearchable === newSearchable) {
      score += 1
    }

    return score
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deeply recursive JSON schema manipulation
  private cleanSchemaForComparison(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema
    }

    const cleaned = Array.isArray(schema) ? [...schema] : { ...schema }

    if (cleaned['x-zui']) {
      const xZui = { ...cleaned['x-zui'] }
      delete xZui.index
      if (Object.keys(xZui).length === 0) {
        delete cleaned['x-zui']
      } else {
        cleaned['x-zui'] = xZui
      }
    }

    if (cleaned.properties) {
      const cleanedProps: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(cleaned.properties)) {
        cleanedProps[key] = this.cleanSchemaForComparison(value)
      }
      cleaned.properties = cleanedProps
    }

    if (cleaned.items) {
      cleaned.items = this.cleanSchemaForComparison(cleaned.items)
    }

    delete cleaned.additionalProperties

    return cleaned
  }

  private analyzeColumnChanges(
    local: any, // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON schema objects with dynamic structure
    remote: any // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON schema objects with dynamic structure
  ): {
    differences: string[]
    columnChanges: ColumnChange[]
  } {
    const differences: string[] = []
    const columnChanges: ColumnChange[] = []

    if (!local || !remote) {
      return { differences, columnChanges }
    }

    const cleanedLocal = this.cleanSchemaForComparison(local)
    const cleanedRemote = this.cleanSchemaForComparison(remote)

    const localProps = cleanedLocal.properties || {}
    const remoteProps = cleanedRemote.properties || {}

    const localKeys = Object.keys(localProps)
    const remoteKeys = Object.keys(remoteProps)

    const addedKeys = localKeys.filter((k) => !remoteKeys.includes(k))
    const removedKeys = remoteKeys.filter((k) => !localKeys.includes(k))
    const commonKeys = localKeys.filter((k) => remoteKeys.includes(k))

    const addedByType: Map<string, string[]> = new Map()
    const removedByType: Map<string, string[]> = new Map()

    for (const key of addedKeys) {
      const localType = this.getSchemaType(localProps[key])
      if (!addedByType.has(localType)) {
        addedByType.set(localType, [])
      }
      addedByType.get(localType)!.push(key)
    }

    for (const key of removedKeys) {
      const remoteType = this.getSchemaType(remoteProps[key])
      if (!removedByType.has(remoteType)) {
        removedByType.set(remoteType, [])
      }
      removedByType.get(remoteType)!.push(key)
    }

    const renamedColumns = new Set<string>()

    // Smart rename detection using multiple heuristics
    for (const [type, removedCols] of removedByType.entries()) {
      const addedCols = addedByType.get(type) || []
      if (removedCols.length === 0 || addedCols.length === 0) {
        continue
      }

      // Calculate match scores for each removed-added pair
      const matches: Array<{ removed: string; added: string; score: number }> = []

      for (const removed of removedCols) {
        for (const added of addedCols) {
          const score = this.calculateRenameScore(
            remoteProps[removed],
            localProps[added],
            remoteKeys.indexOf(removed),
            localKeys.indexOf(added)
          )

          if (score > 0) {
            matches.push({ removed, added, score })
          }
        }
      }

      // Sort by score descending
      matches.sort((a, b) => b.score - a.score)

      // Greedily match highest scores, ensuring 1:1 mapping
      const usedRemoved = new Set<string>()
      const usedAdded = new Set<string>()

      for (const match of matches) {
        if (usedRemoved.has(match.removed) || usedAdded.has(match.added)) {
          continue
        }

        // Only consider it a rename if score is high enough
        if (match.score >= 2) {
          columnChanges.push({
            type: 'rename',
            columnName: match.added,
            oldColumnName: match.removed,
            oldType: type,
            newType: type,
            details: `Column "${match.removed}" → "${match.added}"`,
          })

          differences.push(`↔️ Renamed column "${match.removed}" → "${match.added}" (${type})`)

          renamedColumns.add(match.removed)
          renamedColumns.add(match.added)
          usedRemoved.add(match.removed)
          usedAdded.add(match.added)
        }
      }
    }

    const localRequired = cleanedLocal.required || []
    const remoteRequired = cleanedRemote.required || []

    for (const key of addedKeys) {
      if (!renamedColumns.has(key)) {
        const localType = this.getSchemaType(localProps[key])
        const isRequired = localRequired.includes(key)
        columnChanges.push({
          type: 'add',
          columnName: key,
          newType: localType,
        })
        const requiredSuffix = isRequired ? ' - required' : ''
        differences.push(`➕ Added column "${key}" (${localType})${requiredSuffix}`)
      }
    }

    for (const key of removedKeys) {
      if (!renamedColumns.has(key)) {
        const remoteType = this.getSchemaType(remoteProps[key])
        const wasRequired = remoteRequired.includes(key)
        columnChanges.push({
          type: 'remove',
          columnName: key,
          oldType: remoteType,
        })
        const requiredSuffix = wasRequired ? ' - was required' : ''
        differences.push(`➖ Removed column "${key}" (${remoteType})${requiredSuffix}`)
      }
    }

    for (const key of commonKeys) {
      const localCol = localProps[key]
      const remoteCol = remoteProps[key]

      const localType = this.getSchemaType(localCol)
      const remoteType = this.getSchemaType(remoteCol)

      if (localType !== remoteType) {
        columnChanges.push({
          type: 'modify',
          columnName: key,
          oldType: remoteType,
          newType: localType,
          details: `Type changed from ${remoteType} to ${localType}`,
        })
        differences.push(`🔀 Column "${key}": type changed from ${remoteType} to ${localType}`)
      }

      const localSearchable = localCol?.['x-zui']?.searchable
      const remoteSearchable = remoteCol?.['x-zui']?.searchable
      // The API doesn't persist x-zui.searchable — remote is always undefined after a round-trip.
      // Comparing against undefined would flag every column on every restart, so skip entirely.
      if (localSearchable !== remoteSearchable && remoteSearchable !== undefined) {
        differences.push(
          `🔍 Column "${key}": searchable ${remoteSearchable ? 'disabled' : 'enabled'} (was ${remoteSearchable ? 'enabled' : 'disabled'})`
        )
      }

      const localRequired = cleanedLocal.required?.includes(key) || false
      const remoteRequired = cleanedRemote.required?.includes(key) || false
      if (localRequired !== remoteRequired) {
        differences.push(
          `${localRequired ? '🔒' : '🔓'} Column "${key}": ${localRequired ? 'now required' : 'now optional'}`
        )
      }

      const cleanedLocalCol = this.cleanSchemaForComparison(localCol)
      const cleanedRemoteCol = this.cleanSchemaForComparison(remoteCol)

      if (JSON.stringify(cleanedLocalCol) !== JSON.stringify(cleanedRemoteCol) && localType === remoteType) {
        const localDesc = localCol?.description
        const remoteDesc = remoteCol?.description
        if (localDesc !== remoteDesc) {
          differences.push(`💬 Column "${key}": description updated`)
        }
      }
    }

    return { differences, columnChanges }
  }

  private createSchemaForUpdate(localSchema: JSONSchema7, columnChanges: ColumnChange[]): JSONSchema7 {
    const updatedSchema = JSON.parse(JSON.stringify(localSchema)) as JSONSchema7

    if (!updatedSchema.properties) {
      updatedSchema.properties = {}
    }

    // Ensure required array exists (even if empty) to properly update optional/required status
    if (!updatedSchema.required) {
      updatedSchema.required = []
    }

    // Only handle actual removals in the schema
    // Renames are handled separately via renameTableColumn API
    for (const change of columnChanges) {
      if (change.type === 'remove') {
        // Mark column for removal by setting to null
        updatedSchema.properties[change.columnName] = { type: 'null' }

        if (updatedSchema.required && updatedSchema.required.includes(change.columnName)) {
          updatedSchema.required = updatedSchema.required.filter((req: string) => req !== change.columnName)
        }
      }
    }

    return updatedSchema
  }

  async getLocalTables(): Promise<LocalTable[]> {
    const tables: LocalTable[] = []

    for (const tableRef of this.project.tables) {
      try {
        tables.push({
          name: tableRef.definition.name,
          factor: tableRef.definition.factor,
          schema: tableRef.definition.schema,
          keyColumn: tableRef.definition.keyColumn,
          tags: tableRef.definition.tags,
        } satisfies LocalTable)
      } catch {
        // Skip the broken table. Silently dropping it leaves the user staring
        // at a missing table with no clue why.
        // TODO(ADK-638): warn via the injected logger once adk has one —
        // include tableRef.export, tableRef.path, and the load error.
      }
    }

    return tables
  }

  async getRemoteTables(): Promise<RemoteTable[]> {
    this.assertBotId('get remote tables')

    const client = await this.getClient()

    try {
      const response = await client.listTables({})

      return response.tables.map(
        (table) =>
          ({
            id: table.id,
            name: table.name,
            createdAt: table.createdAt || new Date().toISOString(),
            updatedAt: table.updatedAt || new Date().toISOString(),
            factor: table.factor || 1,
            schema: table.schema,
            keyColumn: table.keyColumn || '',
            tags: table.tags || {},
          }) satisfies RemoteTable
      )
    } catch (error) {
      console.error('Failed to list remote tables:', error instanceof Error ? error.message : String(error))
      return []
    }
  }

  async createSyncPlan(): Promise<TableSyncPlan> {
    const localTables = await this.getLocalTables()
    const remoteTables = await this.getRemoteTables()

    const items: TableSyncItem[] = []
    const remoteMap = new Map(remoteTables.map((t) => [t.name, t]))

    // Check each local table
    for (const local of localTables) {
      const remote = remoteMap.get(local.name)

      if (!remote) {
        // Table doesn't exist remotely - need to create
        items.push({
          operation: TableSyncOperation.Create,
          localTable: local,
          reason: 'Table does not exist remotely',
        })
      } else {
        // Table exists - check if schema matches
        try {
          const cleanedLocalSchema = this.cleanSchemaForComparison(local.schema)
          const cleanedRemoteSchema = this.cleanSchemaForComparison(remote.schema)

          const { differences, columnChanges } = this.analyzeColumnChanges(local.schema, remote.schema)
          const factorMatches = (local.factor || 1) === (remote.factor || 1)
          const keyColumnMatches = (local.keyColumn || '') === (remote.keyColumn || '')
          const tagsMatch = JSON.stringify(local.tags || {}) === JSON.stringify(remote.tags || {})

          const localSchema = transforms.fromJSONSchema(cleanedLocalSchema)
          const remoteSchema = transforms.fromJSONSchema(cleanedRemoteSchema)
          const schemasEqual = localSchema.isEqual(remoteSchema)
          const hasMetadataChanges = differences.length > 0

          if (!schemasEqual || !factorMatches || hasMetadataChanges || !keyColumnMatches || !tagsMatch) {
            const reasons: string[] = []
            if (differences.length > 0) {
              reasons.push('schema changes detected')
            } else if (!schemasEqual) {
              reasons.push('schema metadata changed')
            }
            if (!factorMatches) {
              differences.push(`⚡ Factor: ${remote.factor || 1} → ${local.factor || 1}`)
              reasons.push('factor changed')
            }

            if (!keyColumnMatches) {
              differences.push(`🔑 Key Column: "${remote.keyColumn || ''}" → "${local.keyColumn || ''}"`)
              reasons.push('key column changed')
            }

            if (!tagsMatch) {
              differences.push(
                `🏷️ Tags updated: ${JSON.stringify(remote.tags || {})} → ${JSON.stringify(local.tags || {})}`
              )
              reasons.push('tags changed')
            }

            const schemaForUpdate = this.createSchemaForUpdate(local.schema, columnChanges)

            items.push({
              operation: TableSyncOperation.Update,
              localTable: local,
              remoteTable: remote,
              reason: `Table ${reasons.join(' and ')}`,
              differences: differences.length > 0 ? differences : undefined,
              columnChanges: columnChanges.length > 0 ? columnChanges : undefined,
              schemaForUpdate,
            })
          } else {
            // Schema matches - no update needed
            items.push({
              operation: TableSyncOperation.None,
              localTable: local,
              remoteTable: remote,
              reason: 'Table schema is up to date',
            })
          }
        } catch {
          // If we can't compare schemas, assume they need updating
          items.push({
            operation: TableSyncOperation.Update,
            localTable: local,
            remoteTable: remote,
            reason: 'Unable to compare schemas - assuming update needed',
          })
        }

        // Remove from map so we can find orphaned tables
        remoteMap.delete(local.name)
      }
    }

    // Remaining remote tables don't have local counterparts
    for (const [, remote] of remoteMap) {
      items.push({
        operation: TableSyncOperation.Delete,
        remoteTable: remote,
        reason: 'Table no longer defined locally',
      })
    }

    // Calculate totals
    const totalCreate = items.filter((i) => i.operation === TableSyncOperation.Create).length
    const totalUpdate = items.filter((i) => i.operation === TableSyncOperation.Update).length
    const totalDelete = items.filter((i) => i.operation === TableSyncOperation.Delete).length
    const hasChanges = totalCreate > 0 || totalUpdate > 0 || totalDelete > 0

    return {
      items,
      totalCreate,
      totalUpdate,
      totalDelete,
      hasChanges,
    }
  }

  async executeSync(plan: TableSyncPlan, options: TableSyncOptions = {}): Promise<TableSyncResult> {
    this.assertBotId('sync tables')

    if (options.dryRun) {
      return {
        applied: false,
        success: [],
        failed: [],
        skipped: [],
        summary: {
          created: 0,
          updated: 0,
          deleted: 0,
          skipped: 0,
          failed: 0,
        },
      }
    }

    const client = await this.getClient()
    const success: TableSyncItem[] = []
    const failed: Array<{ item: TableSyncItem; error: Error }> = []
    const skipped: TableSyncItem[] = []

    for (const item of plan.items) {
      if (item.operation === TableSyncOperation.None) {
        success.push(item)
        continue
      }

      try {
        switch (item.operation) {
          case TableSyncOperation.Create:
            if (item.localTable) {
              await client.createTable({
                name: item.localTable.name,
                factor: item.localTable.factor || 1,
                schema: item.localTable.schema,
                isComputeEnabled: true,
                keyColumn: item.localTable.keyColumn || '',
                tags: item.localTable.tags || {},
              })
              success.push(item)
            }
            break

          case TableSyncOperation.Update:
            if (item.localTable && item.remoteTable) {
              // Step 1: Handle column renames first (must be done before schema update)
              if (item.columnChanges) {
                const renames = item.columnChanges.filter((c) => c.type === 'rename')
                for (const rename of renames) {
                  if (rename.oldColumnName && rename.columnName) {
                    await client.renameTableColumn({
                      table: item.localTable.name,
                      name: rename.oldColumnName,
                      newName: rename.columnName,
                    })
                  }
                }
              }

              // Step 2: Apply schema updates (after renames are done)
              let schemaToUse = item.schemaForUpdate || item.localTable.schema
              const localFactor = item.localTable.factor || 1
              const localKeyColumn = item.localTable.keyColumn || ''
              const localTags = item.localTable.tags || {}
              // Ensure schema has a required array (even if empty) to properly clear required fields
              if (!schemaToUse.required) {
                schemaToUse = { ...schemaToUse, required: [] }
              }

              await client.updateTable({
                table: item.localTable.name,
                factor: localFactor,
                schema: schemaToUse,
                tags: localTags,
                keyColumn: localKeyColumn,
                isComputeEnabled: true,
              })
              success.push(item)
            }
            break

          case TableSyncOperation.Delete:
            if (item.remoteTable) {
              if (!options.confirmDestructive) {
                skipped.push(item)
                continue
              }
              await client.deleteTable({ table: item.remoteTable.name })
              success.push(item)
            }
            break
        }
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error))
        failed.push({ item, error: err })

        if (options.bailOnFailure) {
          break
        }
      }
    }

    return {
      applied: true,
      success,
      failed,
      skipped,
      summary: {
        created: success.filter((i) => i.operation === TableSyncOperation.Create).length,
        updated: success.filter((i) => i.operation === TableSyncOperation.Update).length,
        deleted: success.filter((i) => i.operation === TableSyncOperation.Delete).length,
        skipped: skipped.length,
        failed: failed.length,
      },
    }
  }
}
