// toCatalogSchema converts a standard JSON Schema (e.g. as produced by
// utils.schema.mapZodToJsonSchema from an integration's `configuration` zod
// schema) into the bespoke cloudapi catalog config schema shape:
// `{ fields: { <name>: { type, required, secret } } }`. Used by
// `brt integrations publish` (see command-implementations/integration-commands.ts)
// when deriving a config schema straight from integration.definition.ts rather
// than requiring an operator to hand-author one via --config-schema-file.
//
// Ported from the (deleted) thin brt CLI's commands/integrations.ts
// toCatalogSchema/field, adapted to read directly from a JSON Schema object
// (this fork's own mapZodToJsonSchema output) instead of the un-forked
// toolchain's `bp read --json` snapshot.
export function toCatalogSchema(input: unknown): { fields: Record<string, unknown> } | undefined {
  if (!input || typeof input !== 'object') return undefined
  const obj = input as Record<string, unknown>
  if (obj['fields'] && typeof obj['fields'] === 'object') {
    return obj as { fields: Record<string, unknown> }
  }

  const props = obj['properties']
  if (!props || typeof props !== 'object') return undefined

  const required = new Set(
    Array.isArray(obj['required']) ? (obj['required'] as unknown[]).filter((v): v is string => typeof v === 'string') : []
  )
  const fields: Record<string, unknown> = {}
  for (const [name, raw] of Object.entries(props as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    fields[name] = {
      type: typeof p['type'] === 'string' ? p['type'] : 'string',
      required: required.has(name),
      secret: Boolean(
        p['secret'] || p['x-secret'] || p['x-botpress-secret'] || field(p['x-zui'], 'secret') || p['format'] === 'password'
      ),
    }
  }
  return { fields }
}

function field(obj: unknown, key: string): unknown {
  return obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined
}
