import * as fs from 'fs'
import * as path from 'path'
import * as errors from './errors'

// botruntime.tables.json — a project-level manifest declaring the cloudapi
// tables an ADK bot needs (POST /v1/tables { name, schema } shape). Read by
// `brt deploy --adk`'s table-sync step.
//
// DIVERGENCE from the (deleted) thin brt CLI's src/tables.ts: thin derived
// this list dynamically by shelling out to `adk status --format json` and
// then `instanceof`-importing every declared `Table` from the bot's own
// runtime package (a dependency of the TARGET bot project, resolved from its
// node_modules — not a dependency of this CLI). That mechanism assumes the
// un-forked Botpress SDK/CLI toolchain, which is not part of this fork's own
// lineage and cannot be exercised or tested here. This module instead takes
// the schema directly from a manifest file (the same "declare it in a small
// JSON file next to the source" pattern already used for
// botruntime.commands.json — see declared-commands.ts), so an ADK project
// declares its tables explicitly rather than needing that runtime package
// resolvable at deploy time.
export interface DeclaredTable {
  name: string
  schema: Record<string, unknown>
}

const TABLES_FILE = 'botruntime.tables.json'

export function extractDeclaredTables(dir: string): DeclaredTable[] {
  const filePath = path.join(dir, TABLES_FILE)
  if (!fs.existsSync(filePath)) return []

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `${TABLES_FILE}: invalid JSON`)
  }

  const arr = Array.isArray(raw) ? raw : objectTables(raw)
  const byName = new Map<string, DeclaredTable>()
  const order: string[] = []

  arr.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new errors.BotpressCLIError(`${TABLES_FILE}: tables[${i}] must be an object`)
    }
    const rec = item as Record<string, unknown>
    const name = String(rec['name'] ?? '').trim()
    if (!name) {
      throw new errors.BotpressCLIError(`${TABLES_FILE}: tables[${i}].name is required`)
    }
    const schemaInput = rec['schema']
    if (!schemaInput || typeof schemaInput !== 'object' || Array.isArray(schemaInput)) {
      throw new errors.BotpressCLIError(`${TABLES_FILE}: tables[${i}].schema must be an object`)
    }
    const schema = withColumnIndices(JSON.parse(JSON.stringify(schemaInput)) as Record<string, unknown>)

    const prev = byName.get(name)
    if (prev) {
      if (JSON.stringify(prev.schema) !== JSON.stringify(schema)) {
        throw new errors.BotpressCLIError(`${TABLES_FILE}: table "${name}" is declared twice with conflicting schemas`)
      }
      return
    }
    byName.set(name, { name, schema })
    order.push(name)
  })

  return order.map((name) => byName.get(name)!)
}

function objectTables(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { tables?: unknown }).tables)) {
    throw new errors.BotpressCLIError(`${TABLES_FILE}: expected an array or {"tables":[...]}`)
  }
  return (raw as { tables: unknown[] }).tables
}

// withColumnIndices stamps x-zui.index onto each property in declared (i.e.
// JS object insertion) order — cloudapi orders table columns by x-zui.index
// (tie-break by name); without an explicit index every column collapses to 0
// and columns are re-sorted alphabetically, silently scrambling the declared
// order. Ported verbatim from thin's src/tables.ts.
export function withColumnIndices(schema: Record<string, unknown>): Record<string, unknown> {
  const props = schema['properties'] as Record<string, Record<string, unknown>> | undefined
  if (!props || typeof props !== 'object') {
    throw new errors.BotpressCLIError(`${TABLES_FILE}: table schema has no properties object — cannot derive column indices`)
  }
  let index = 0
  for (const key of Object.keys(props)) {
    const prop = (props[key] ??= {})
    const zui = (prop['x-zui'] as Record<string, unknown>) ?? (prop['x-zui'] = {})
    ;(zui as Record<string, unknown>)['index'] = index++
  }
  return schema
}
