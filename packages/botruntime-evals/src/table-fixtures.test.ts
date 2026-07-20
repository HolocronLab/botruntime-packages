import { describe, expect, it, vi } from 'vitest'
import { DurableEvalEffectRetryError } from './errors'
import {
  cleanupSeededTableRows,
  gradeTableAssertions,
  materializeEvalSetup,
  seedEvalTables,
  validateEvalTableContract,
} from './table-fixtures'

describe('durable eval table fixtures', () => {
  it('materializes one execution identity across state and table rows', () => {
    expect(
      materializeEvalSetup(
        {
          state: { conversation: { activeWorkflowId: 'case-{{eval.id}}' } },
          tables: [
            {
              table: 'DolschikTable',
              rows: [
                {
                  caseWorkflowId: 'case-{{eval.id}}',
                  fullName: 'Тестовый заявитель',
                },
              ],
            },
          ],
        },
        'run-41:entry-397'
      )
    ).toEqual({
      state: { conversation: { activeWorkflowId: 'case-run-41:entry-397' } },
      tables: [
        {
          table: 'DolschikTable',
          rows: [
            {
              caseWorkflowId: 'case-run-41:entry-397',
              fullName: 'Тестовый заявитель',
            },
          ],
        },
      ],
    })
  })

  it('creates declared rows and cleans up only the exact seeded row ids', async () => {
    const client = {
      createTableRows: vi.fn().mockResolvedValue({ rows: [{ id: 101 }, { id: 102 }] }),
      deleteTableRows: vi.fn().mockResolvedValue({ deletedRows: 2 }),
    } as any

    const seeded = await seedEvalTables(client, [
      { table: 'DolschikTable', rows: [{ fullName: 'A' }, { fullName: 'B' }] },
    ])
    await cleanupSeededTableRows(client, seeded)

    expect(client.createTableRows).toHaveBeenCalledWith({
      table: 'DolschikTable',
      rows: [{ fullName: 'A' }, { fullName: 'B' }],
      waitComputed: true,
    })
    expect(client.deleteTableRows).toHaveBeenCalledWith({
      table: 'DolschikTable',
      ids: [101, 102],
    })
  })

  it('uses a stable host effect identity for durable table seeds', async () => {
    const client = { createTableRows: vi.fn() } as any
    const durableEffects = {
      createTableRows: vi.fn().mockResolvedValue({ rows: [{ id: 201 }] }),
    } as any

    await expect(
      seedEvalTables(
        client,
        [{ table: 'DocumentTable', rows: [{ status: 'ready' }] }],
        durableEffects,
        'run-120:16'
      )
    ).resolves.toEqual([{ table: 'DocumentTable', ids: [201] }])

    expect(durableEffects.createTableRows).toHaveBeenCalledWith({
      table: 'DocumentTable',
      rows: [{ status: 'ready' }],
      effectId: 'eval:run-120:16:setup:table:0',
    })
    expect(client.createTableRows).not.toHaveBeenCalled()
  })

  it('fails before mutation when a durable table seed has no execution identity', async () => {
    const client = { createTableRows: vi.fn() } as any
    const durableEffects = { createTableRows: vi.fn() } as any

    await expect(
      seedEvalTables(client, [{ table: 'DocumentTable', rows: [{ status: 'ready' }] }], durableEffects)
    ).rejects.toMatchObject({ code: 'EVAL_TABLE_SETUP_INVALID', expected: true })
    expect(durableEffects.createTableRows).not.toHaveBeenCalled()
  })

  it('retries an incomplete durable table acknowledgement without deleting an unknown committed batch', async () => {
    const client = { createTableRows: vi.fn(), deleteTableRows: vi.fn() } as any
    const durableEffects = {
      createTableRows: vi.fn().mockResolvedValue({ rows: [{ id: 201 }] }),
    } as any

    await expect(
      seedEvalTables(
        client,
        [{ table: 'DocumentTable', rows: [{ status: 'first' }, { status: 'second' }] }],
        durableEffects,
        'run-120:16'
      )
    ).rejects.toBeInstanceOf(DurableEvalEffectRetryError)
    expect(client.deleteTableRows).not.toHaveBeenCalled()
  })

  it('grades Botpress-shaped row_exists assertions without persisting row contents', async () => {
    const client = {
      findTableRows: vi.fn().mockResolvedValue({
        rows: [
          { id: 1, status: 'draft', claimant: { name: 'Анна' } },
          { id: 2, status: 'verified', claimant: { name: 'Роман' } },
        ],
        hasMore: false,
        offset: 0,
        limit: 1000,
      }),
    } as any

    const results = await gradeTableAssertions(client, [
      {
        table: 'DocumentTable',
        row_exists: {
          status: { equals: 'verified' },
          'claimant.name': { contains: 'Ром' },
        },
      },
    ])

    expect(results).toEqual([
      {
        assertion: 'table DocumentTable row_exists',
        pass: true,
        expected: 'At least one row matches 2 field assertions',
        actual: 'Matched 1 of 2 rows',
      },
    ])
    expect(JSON.stringify(results)).not.toContain('Анна')
    expect(JSON.stringify(results)).not.toContain('Роман')
  })

  it('grades Botpress-shaped row_count assertions over a where filter', async () => {
    const client = {
      findTableRows: vi.fn().mockResolvedValue({
        rows: [{ status: 'draft' }, { status: 'verified' }, { status: 'verified' }],
        hasMore: false,
      }),
    } as any

    await expect(
      gradeTableAssertions(client, [
        {
          table: 'DocumentTable',
          row_count: { gte: 2 },
          where: { status: { equals: 'verified' } },
        },
      ])
    ).resolves.toEqual([
      {
        assertion: 'table DocumentTable row_count',
        pass: true,
        expected: 'Matching row count is gte 2',
        actual: 'Matched 2 rows',
      },
    ])
  })

  it('rolls back returned row ids when the Tables API reports partial creation errors', async () => {
    const client = {
      createTableRows: vi.fn().mockResolvedValue({
        rows: [{ id: 101 }],
        errors: ['invalid second row'],
      }),
      deleteTableRows: vi.fn().mockResolvedValue({ deletedRows: 1 }),
    } as any

    await expect(
      seedEvalTables(client, [{ table: 'DocumentTable', rows: [{ status: 'ok' }, { status: 'bad' }] }])
    ).rejects.toMatchObject({ code: 'EVAL_TABLE_SEED_FAILED' })
    expect(client.deleteTableRows).toHaveBeenCalledWith({
      table: 'DocumentTable',
      ids: [101],
    })
  })

  it('rejects an ambiguous table assertion during preflight validation', () => {
    expect(() =>
      validateEvalTableContract({
        name: 'invalid-table-contract',
        conversation: [
          {
            user: 'go',
            assert: {
              tables: [
                {
                  table: 'DocumentTable',
                  row_exists: { status: { equals: 'verified' } },
                  row_count: { equals: 1 },
                },
              ],
            },
          },
        ],
      })
    ).toThrow('exactly one of row_exists or row_count')
  })

  it('fails loudly when exact-row cleanup is only partially applied', async () => {
    const client = {
      deleteTableRows: vi.fn().mockResolvedValue({ deletedRows: 1 }),
    } as any

    await expect(
      cleanupSeededTableRows(client, [{ table: 'DocumentTable', ids: [101, 102] }])
    ).rejects.toMatchObject({ code: 'EVAL_TABLE_CLEANUP_FAILED' })
  })

  it('retains only unfinished table groups when cleanup is retried', async () => {
    const client = {
      deleteTableRows: vi
        .fn()
        .mockResolvedValueOnce({ deletedRows: 1 })
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce({ deletedRows: 1 }),
    } as any
    const seeded = [
      { table: 'FirstTable', ids: [101] },
      { table: 'SecondTable', ids: [202] },
    ]

    await expect(cleanupSeededTableRows(client, seeded)).rejects.toMatchObject({
      code: 'EVAL_TABLE_CLEANUP_FAILED',
    })
    expect(seeded).toEqual([{ table: 'FirstTable', ids: [101] }])

    await expect(cleanupSeededTableRows(client, seeded)).resolves.toBeUndefined()
    expect(seeded).toEqual([])
  })

  it('accepts an already-applied exact-id delete when finalize acknowledgement is replayed', async () => {
    const client = {
      deleteTableRows: vi.fn().mockResolvedValue({ deletedRows: 0 }),
    } as any
    const seeded = [{ table: 'DocumentTable', ids: [101, 102] }]

    await expect(cleanupSeededTableRows(client, seeded)).resolves.toBeUndefined()
    expect(seeded).toEqual([])
  })
})
