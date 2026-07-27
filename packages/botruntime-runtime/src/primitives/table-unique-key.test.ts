import { describe, expect, it } from 'vitest'
import { z } from '@holocronlab/botruntime-sdk'

import { BaseTable } from './table'

describe('unique table key declaration', () => {
  it('emits the additive wire flag while preserving the string keyColumn', () => {
    const table = new BaseTable({
      name: 'CommandTable',
      columns: {
        commandId: z.string(),
        payload: z.string().optional(),
      },
      keyColumn: {
        name: 'commandId',
        unique: true,
      },
    })

    expect(table.getDefinition()).toMatchObject({
      keyColumn: 'commandId',
      keyColumnUnique: true,
    })
  })

  it.each([
    ['optional', z.string().optional()],
    ['nullable', z.string().nullable()],
    ['boolean', z.boolean()],
  ])('rejects a %s unique key', (_name, schema) => {
    expect(
      () =>
        new BaseTable({
          name: 'InvalidTable',
          columns: { key: schema },
          keyColumn: { name: 'key', unique: true },
        })
    ).toThrow(/required, non-nullable, non-computed strings or numbers/)
  })

  it('rejects a computed unique key', () => {
    expect(
      () =>
        new BaseTable({
          name: 'InvalidTable',
          columns: {
            key: {
              schema: z.string(),
              computed: true,
              dependencies: [],
              value: async () => 'key',
            },
          },
          keyColumn: { name: 'key', unique: true },
        })
    ).toThrow(/required, non-nullable, non-computed strings or numbers/)
  })

  it('keeps legacy string key declarations non-unique', () => {
    const table = new BaseTable({
      name: 'LegacyTable',
      columns: { key: z.string() },
      keyColumn: 'key',
    })
    expect(table.getDefinition()).toMatchObject({
      keyColumn: 'key',
      keyColumnUnique: false,
    })
  })
})
