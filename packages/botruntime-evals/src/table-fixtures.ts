import type { Client as BpClient } from '@holocronlab/botruntime-client'
import type {
  EvalDefinition,
  EvalSetup,
  GraderResult,
  MatchOperator,
  NumericOperator,
  TableAssertion,
} from './types'
import { EvalRunnerError } from './errors'
import { matchValue } from './graders/match'

const EVAL_ID_PLACEHOLDER = '{{eval.id}}'
const TABLE_PAGE_SIZE = 1_000
const MAX_TABLE_ASSERTION_ROWS = 10_000

type TableClient = Pick<BpClient, 'createTableRows' | 'deleteTableRows' | 'findTableRows'>

export type SeededTableRows = { table: string; ids: number[] }

function replaceExecutionId(value: unknown, executionId: string): unknown {
  if (typeof value === 'string') return value.replaceAll(EVAL_ID_PLACEHOLDER, executionId)
  if (Array.isArray(value)) return value.map((item) => replaceExecutionId(item, executionId))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        replaceExecutionId(item, executionId),
      ])
    )
  }
  return value
}

export function materializeEvalSetup(setup: EvalSetup | undefined, executionId: string): EvalSetup | undefined {
  if (!setup) return undefined
  if (!executionId.trim()) {
    throw new EvalRunnerError({
      code: 'EVAL_TABLE_SETUP_INVALID',
      message: 'Eval execution identity must be non-empty.',
      expected: true,
    })
  }
  return replaceExecutionId(setup, executionId) as EvalSetup
}

export function materializeTableAssertions(
  assertions: TableAssertion[] | undefined,
  executionId: string
): TableAssertion[] | undefined {
  return assertions === undefined ? undefined : (replaceExecutionId(assertions, executionId) as TableAssertion[])
}

function validateSeeds(seeds: NonNullable<EvalSetup['tables']>): void {
  for (const seed of seeds) {
    if (
      typeof seed.table !== 'string' ||
      !seed.table.trim() ||
      !Array.isArray(seed.rows) ||
      seed.rows.length === 0 ||
      seed.rows.length > 1_000 ||
      seed.rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
    ) {
      throw new EvalRunnerError({
        code: 'EVAL_TABLE_SETUP_INVALID',
        message: 'Each eval table fixture requires a table name and 1–1000 rows.',
        expected: true,
      })
    }
  }
}

export async function seedEvalTables(
  client: TableClient,
  seeds: NonNullable<EvalSetup['tables']> | undefined
): Promise<SeededTableRows[]> {
  if (!seeds?.length) return []
  validateSeeds(seeds)
  const created: SeededTableRows[] = []
  try {
    for (const seed of seeds) {
      const response = await client.createTableRows({
        table: seed.table,
        rows: seed.rows,
        waitComputed: true,
      })
      created.push({
        table: seed.table,
        ids: response.rows.map((row) => row.id),
      })
      if (response.errors?.length || response.rows.length !== seed.rows.length) {
        throw new Error('Tables API reported partial eval fixture creation.')
      }
    }
    return created
  } catch (cause) {
    try {
      await cleanupSeededTableRows(client, created)
    } catch (cleanupCause) {
      throw new EvalRunnerError({
        code: 'EVAL_TABLE_CLEANUP_FAILED',
        message: 'Eval table fixture creation failed and exact-row rollback also failed.',
        cause: new AggregateError([cause, cleanupCause]),
      })
    }
    throw new EvalRunnerError({
      code: 'EVAL_TABLE_SEED_FAILED',
      message: 'Eval table fixture creation failed.',
      cause,
    })
  }
}

export async function cleanupSeededTableRows(client: TableClient, seeded: SeededTableRows[]): Promise<void> {
  try {
    for (let index = seeded.length - 1; index >= 0; index--) {
      const item = seeded[index]!
      if (item.ids.length > 0) {
        const response = await client.deleteTableRows({
          table: item.table,
          ids: item.ids,
        })
        if (response.deletedRows !== item.ids.length) {
          throw new Error('Tables API reported partial eval fixture cleanup.')
        }
      }
      seeded.splice(index, 1)
    }
  } catch (cause) {
    throw new EvalRunnerError({
      code: 'EVAL_TABLE_CLEANUP_FAILED',
      message: 'Exact-row cleanup of eval table fixtures failed.',
      cause,
    })
  }
}

function valueAtPath(row: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return (value as Record<string, unknown>)[segment]
  }, row)
}

function rowMatches(row: Record<string, unknown>, expected: Record<string, MatchOperator>): boolean {
  return Object.entries(expected).every(([path, operator]) => matchValue(operator, valueAtPath(row, path)))
}

function validateAssertion(assertion: TableAssertion): void {
  const modes = Number(assertion.row_exists !== undefined) + Number(assertion.row_count !== undefined)
  const invalidRecord = (value: unknown) => !value || typeof value !== 'object' || Array.isArray(value)
  const validNumericOperator = (value: unknown) => {
    if (invalidRecord(value)) return false
    const entries = Object.entries(value as Record<string, unknown>)
    return (
      entries.length === 1 &&
      ['equals', 'gte', 'lte'].includes(entries[0]![0]) &&
      typeof entries[0]![1] === 'number' &&
      Number.isFinite(entries[0]![1])
    )
  }
  if (
    typeof assertion.table !== 'string' ||
    !assertion.table.trim() ||
    modes !== 1 ||
    (assertion.row_exists !== undefined && invalidRecord(assertion.row_exists)) ||
    (assertion.row_count !== undefined && !validNumericOperator(assertion.row_count)) ||
    (assertion.where !== undefined && invalidRecord(assertion.where)) ||
    (assertion.row_exists !== undefined && assertion.where !== undefined)
  ) {
    throw new EvalRunnerError({
      code: 'EVAL_TABLE_ASSERTION_INVALID',
      message:
        'Each table assertion requires exactly one of row_exists or row_count; where is only valid with row_count.',
      expected: true,
    })
  }
}

export function validateEvalTableContract(evalDef: EvalDefinition): void {
  if (evalDef.setup?.tables) validateSeeds(evalDef.setup.tables)
  for (const turn of evalDef.conversation) {
    for (const assertion of turn.assert?.tables ?? []) validateAssertion(assertion)
  }
  for (const assertion of evalDef.outcome?.tables ?? []) validateAssertion(assertion)
}

function numericMatches(operator: NumericOperator, actual: number): boolean {
  if ('equals' in operator) return actual === operator.equals
  if ('gte' in operator) return actual >= operator.gte
  return actual <= operator.lte
}

function numericExpectation(operator: NumericOperator): string {
  if ('equals' in operator) return `equals ${operator.equals}`
  if ('gte' in operator) return `gte ${operator.gte}`
  return `lte ${operator.lte}`
}

async function readRows(client: TableClient, table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; offset < MAX_TABLE_ASSERTION_ROWS; offset += TABLE_PAGE_SIZE) {
    const page = await client.findTableRows({
      table,
      limit: TABLE_PAGE_SIZE,
      offset,
    })
    rows.push(...page.rows)
    if (!page.hasMore) return rows
  }
  throw new EvalRunnerError({
    code: 'EVAL_TABLE_ASSERTION_INVALID',
    message: `Table assertion scan for ${table} exceeded ${MAX_TABLE_ASSERTION_ROWS} rows; add a narrower eval fixture table.`,
    expected: true,
  })
}

export async function gradeTableAssertions(
  client: TableClient,
  assertions: TableAssertion[] | undefined
): Promise<GraderResult[]> {
  if (!assertions?.length) return []
  const results: GraderResult[] = []
  for (const assertion of assertions) {
    validateAssertion(assertion)
    const rows = await readRows(client, assertion.table)
    if (assertion.row_exists !== undefined) {
      const matched = rows.filter((row) => rowMatches(row, assertion.row_exists!)).length
      results.push({
        assertion: `table ${assertion.table} row_exists`,
        pass: matched > 0,
        expected: `At least one row matches ${Object.keys(assertion.row_exists).length} field assertions`,
        actual: `Matched ${matched} of ${rows.length} rows`,
      })
      continue
    }
    const matched = assertion.where ? rows.filter((row) => rowMatches(row, assertion.where!)).length : rows.length
    const rowCount = assertion.row_count!
    results.push({
      assertion: `table ${assertion.table} row_count`,
      pass: numericMatches(rowCount, matched),
      expected: `Matching row count is ${numericExpectation(rowCount)}`,
      actual: `Matched ${matched} rows`,
    })
  }
  return results
}
