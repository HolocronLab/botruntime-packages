import * as sdk from '@holocronlab/botruntime-sdk'
import { describe, expect, it } from 'vitest'
import { auditTableKeyContracts } from './table-key-contract'

const definition = {
  tables: {
    AgentEventTable: {
      schema: sdk.z.object({ eventKey: sdk.z.string() }),
      keyColumn: 'eventKey',
      keyColumnUnique: true,
    },
  },
} as unknown as sdk.BotDefinition

describe('table key contract readiness', () => {
  it('reports the exact disabled drift from a development target', () => {
    expect(
      auditTableKeyContracts(definition, [
        {
          name: 'AgentEventTable',
          keyColumn: null,
          keyColumnUnique: false,
          keyColumnUniqueState: 'disabled',
        },
      ])
    ).toEqual({
      ready: false,
      declared: 1,
      items: [
        {
          name: 'AgentEventTable',
          ready: false,
          expected: {
            keyColumn: 'eventKey',
            unique: true,
          },
          actual: {
            exists: true,
            keyColumn: null,
            unique: false,
            state: 'disabled',
          },
          reason: 'remote key contract differs from the declaration',
        },
      ],
    })
  })

  it('accepts only the terminal enabled contract', () => {
    const report = auditTableKeyContracts(definition, [
      {
        name: 'AgentEventTable',
        keyColumn: 'eventKey',
        keyColumnUnique: true,
        keyColumnUniqueState: 'enabled',
      },
    ])

    expect(report.ready).toBe(true)
    expect(report.items[0]?.ready).toBe(true)
  })
})
