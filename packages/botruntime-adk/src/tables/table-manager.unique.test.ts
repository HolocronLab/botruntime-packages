import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  getProjectClient: vi.fn(),
}))

vi.mock('../auth/index.js', () => ({
  getProjectClient: authMocks.getProjectClient,
}))

import { TableManager } from './table-manager.js'
import { TableSyncOperation, type TableSyncPlan } from './types.js'

const schema = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    value: { type: 'string' },
  },
  required: ['key'],
} as const

function projectWithUniqueTable() {
  return {
    tables: [
      {
        definition: {
          name: 'claims',
          factor: 1,
          schema,
          keyColumn: 'key',
          keyColumnUnique: true,
          tags: { owner: 'lawyer' },
        },
      },
    ],
  }
}

describe('TableManager unique key contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the unique declaration in the local table contract', async () => {
    const manager = new TableManager({ project: projectWithUniqueTable() as never })

    await expect(manager.getLocalTables()).resolves.toEqual([
      expect.objectContaining({
        name: 'claims',
        keyColumn: 'key',
        keyColumnUnique: true,
      }),
    ])
  })

  it('reads lifecycle state from the remote contract', async () => {
    authMocks.getProjectClient.mockResolvedValue({
      listTables: vi.fn().mockResolvedValue({
        tables: [
          {
            id: 'table_1',
            name: 'claims',
            createdAt: '2026-07-26T00:00:00.000Z',
            updatedAt: '2026-07-26T00:00:00.000Z',
            schema,
            keyColumn: 'key',
            keyColumnUnique: true,
            keyColumnUniqueState: 'enabled',
          },
        ],
      }),
    })
    const manager = new TableManager({
      project: projectWithUniqueTable() as never,
      botId: 'bot_1',
    })

    await expect(manager.getRemoteTables()).resolves.toEqual([
      expect.objectContaining({
        keyColumnUnique: true,
        keyColumnUniqueState: 'enabled',
      }),
    ])
  })

  it('forwards the unique contract when creating a new table', async () => {
    const createTable = vi.fn().mockResolvedValue({})
    authMocks.getProjectClient.mockResolvedValue({ createTable })
    const manager = new TableManager({
      project: projectWithUniqueTable() as never,
      botId: 'bot_1',
    })
    const localTable = (await manager.getLocalTables())[0]!
    const plan: TableSyncPlan = {
      items: [
        {
          operation: TableSyncOperation.Create,
          localTable,
          reason: 'new table',
        },
      ],
      totalCreate: 1,
      totalUpdate: 0,
      totalDelete: 0,
      hasChanges: true,
    }

    const result = await manager.executeSync(plan)

    expect(result.failed).toEqual([])
    expect(createTable).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'claims',
        keyColumn: 'key',
        keyColumnUnique: true,
      })
    )
  })

  it('fails closed before schema mutations when an existing contract needs staging', async () => {
    const renameTableColumn = vi.fn()
    const updateTable = vi.fn()
    authMocks.getProjectClient.mockResolvedValue({ renameTableColumn, updateTable })
    const manager = new TableManager({
      project: projectWithUniqueTable() as never,
      botId: 'bot_1',
    })
    const localTable = (await manager.getLocalTables())[0]!
    const plan: TableSyncPlan = {
      items: [
        {
          operation: TableSyncOperation.Update,
          localTable,
          remoteTable: {
            id: 'table_1',
            name: 'claims',
            createdAt: '2026-07-26T00:00:00.000Z',
            updatedAt: '2026-07-26T00:00:00.000Z',
            schema,
            keyColumn: 'key',
            keyColumnUnique: false,
            keyColumnUniqueState: 'disabled',
          },
          reason: 'unique key contract changed',
          columnChanges: [
            {
              type: 'rename',
              oldColumnName: 'old_value',
              columnName: 'value',
            },
          ],
        },
      ],
      totalCreate: 0,
      totalUpdate: 1,
      totalDelete: 0,
      hasChanges: true,
    }

    const result = await manager.executeSync(plan)

    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.error.message).toContain('staged table-contract capability')
    expect(renameTableColumn).not.toHaveBeenCalled()
    expect(updateTable).not.toHaveBeenCalled()
  })
})
