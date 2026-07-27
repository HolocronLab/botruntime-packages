import * as sdk from '@holocronlab/botruntime-sdk'
import * as errors from '../errors'

export type TableKeyContract = {
  keyColumn: string | null
  unique: boolean
}

export type RemoteTableKeyContract = {
  name: string
  keyColumn?: string | null
  keyColumnUnique?: boolean
  keyColumnUniqueState?: string
}

export type TableKeyContractReadinessItem = {
  name: string
  ready: boolean
  expected: TableKeyContract
  actual: {
    exists: boolean
    keyColumn: string | null
    unique: boolean
    state: string
  }
  reason?: string
}

export type TableKeyContractReadiness = {
  ready: boolean
  declared: number
  items: TableKeyContractReadinessItem[]
}

export function tableUniqueState(
  table: Pick<RemoteTableKeyContract, 'keyColumnUnique' | 'keyColumnUniqueState'>
): string {
  if (table.keyColumnUniqueState !== undefined) {
    return table.keyColumnUniqueState
  }
  return table.keyColumnUnique === undefined ? 'disabled' : 'unknown'
}

export function declaredTableKeyContract(
  tableDef: sdk.BotTableDefinition
): TableKeyContract {
  const raw = tableDef.keyColumn as
    | string
    | null
    | undefined
    | { name?: unknown; unique?: unknown }
  if (raw && typeof raw === 'object') {
    if (typeof raw.name !== 'string' || raw.name.length === 0) {
      throw new errors.BotpressCLIError(
        'Table keyColumn object requires a non-empty string name.'
      )
    }
    return {
      keyColumn: raw.name,
      unique: raw.unique === true || tableDef.keyColumnUnique === true,
    }
  }
  return {
    keyColumn: raw ?? null,
    unique: tableDef.keyColumnUnique === true,
  }
}

export function tableKeyContractMatches(
  table: Pick<
    RemoteTableKeyContract,
    'keyColumn' | 'keyColumnUnique' | 'keyColumnUniqueState'
  >,
  expected: TableKeyContract
): boolean {
  return (
    (table.keyColumn ?? null) === expected.keyColumn &&
    (table.keyColumnUnique ?? false) === expected.unique &&
    tableUniqueState(table) === (expected.unique ? 'enabled' : 'disabled')
  )
}

export function auditTableKeyContracts(
  botDefinition: sdk.BotDefinition,
  remoteTables: RemoteTableKeyContract[]
): TableKeyContractReadiness {
  const byName = new Map(remoteTables.map((table) => [table.name, table]))
  const items = Object.entries(botDefinition.tables ?? {})
    .map(([name, tableDef]): TableKeyContractReadinessItem => {
      const expected = declaredTableKeyContract(tableDef)
      const remote = byName.get(name)
      if (!remote) {
        return {
          name,
          ready: false,
          expected,
          actual: {
            exists: false,
            keyColumn: null,
            unique: false,
            state: 'missing',
          },
          reason: 'table is missing from the development target',
        }
      }
      const actual = {
        exists: true,
        keyColumn: remote.keyColumn ?? null,
        unique: remote.keyColumnUnique ?? false,
        state: tableUniqueState(remote),
      }
      const ready = tableKeyContractMatches(remote, expected)
      return {
        name,
        ready,
        expected,
        actual,
        ...(!ready ? { reason: 'remote key contract differs from the declaration' } : {}),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    ready: items.every((item) => item.ready),
    declared: items.length,
    items,
  }
}
