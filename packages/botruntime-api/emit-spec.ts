/**
 * Emits the canonical OpenAPI 3 documents for the Botpress-shaped API, one per
 * opapi "section" (public, runtime, admin, files, tables, billing) plus a
 * combined document (public + admin + runtime, the surface `packages/brt`
 * depends on).
 *
 * Each `OpenApi` instance's `exportOpenapi(dir)` (from `@bpinternal/opapi`) is
 * synchronous and always writes a fixed `openapi.json` (+ `metadata.json`)
 * into the given directory. We call it into a scratch temp dir per section,
 * then relocate the result to `openapi/<section>.json` so the six sections
 * don't clobber each other.
 *
 * No `ignoreDefaultParameters` / `ignoreSecurity` export options are passed
 * here: those strip metadata for client codegen (see ADR-0005) and would make
 * this canonical spec less complete, not more.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { api, runtimeApi, adminApi, filesApi, tablesApi, billingApi } from './src'

interface OpenApiExporter {
  exportOpenapi(dir?: string): void
}

const SECTIONS: ReadonlyArray<readonly [string, OpenApiExporter]> = [
  ['public', api],
  ['runtime', runtimeApi],
  ['admin', adminApi],
  ['files', filesApi],
  ['tables', tablesApi],
  ['billing', billingApi],
]

const OUT_DIR = path.join(__dirname, 'openapi')

// The upstream opapi definitions bake in the Botpress default host. Rebrand it in the
// emitted spec so published-spec consumers / generated clients see the botruntime host.
// Only the visible host string changes; /v1 paths and x-* headers are untouched (contract).
const SERVER_URL = 'https://botruntime.ru'

type JsonRecord = Record<string, unknown>

function rewriteServers(doc: JsonRecord): void {
  const servers = doc.servers as Array<{ url?: string }> | undefined
  if (!Array.isArray(servers)) return
  for (const server of servers) {
    if (typeof server.url === 'string') {
      server.url = server.url.replace(/https?:\/\/[a-z0-9.-]*botpress\.cloud/gi, SERVER_URL)
    }
  }
}

function exportSection(name: string, instance: OpenApiExporter): JsonRecord {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `botruntime-api-${name}-`))
  try {
    instance.exportOpenapi(tmpDir)
    const raw = fs.readFileSync(path.join(tmpDir, 'openapi.json'), 'utf8')
    const doc = JSON.parse(raw) as JsonRecord
    rewriteServers(doc)
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), `${JSON.stringify(doc, null, 2)}\n`)
    return doc
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

const COMPONENT_KEYS = ['schemas', 'responses', 'requestBodies', 'parameters', 'securitySchemes'] as const

function mergeComponents(docs: JsonRecord[]): JsonRecord {
  const merged: Record<(typeof COMPONENT_KEYS)[number], JsonRecord> = {
    schemas: {},
    responses: {},
    requestBodies: {},
    parameters: {},
    securitySchemes: {},
  }
  for (const doc of docs) {
    const components = (doc.components ?? {}) as Partial<Record<(typeof COMPONENT_KEYS)[number], JsonRecord>>
    for (const key of COMPONENT_KEYS) {
      Object.assign(merged[key], components[key] ?? {})
    }
  }
  return merged
}

function mergeTags(docs: JsonRecord[]): unknown[] {
  const seen = new Set<string>()
  const tags: unknown[] = []
  for (const doc of docs) {
    const docTags = (doc.tags as Array<{ name: string }> | undefined) ?? []
    for (const tag of docTags) {
      if (!seen.has(tag.name)) {
        seen.add(tag.name)
        tags.push(tag)
      }
    }
  }
  return tags
}

function mergePaths(docs: JsonRecord[]): JsonRecord {
  const merged: JsonRecord = {}
  for (const doc of docs) {
    Object.assign(merged, doc.paths as JsonRecord)
  }
  return merged
}

function main(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const docs: Record<string, JsonRecord> = {}
  for (const [name, instance] of SECTIONS) {
    docs[name] = exportSection(name, instance)
  }

  // Combined public + admin + runtime document: the sections that make up the
  // Botpress-shaped API surface `packages/brt` depends on (see ADR-0005).
  const combinedNames = ['public', 'admin', 'runtime']
  const combinedDocs = combinedNames.map((name) => {
    const doc = docs[name]
    if (!doc) throw new Error(`missing section doc to combine: ${name}`)
    return doc
  })
  const base = combinedDocs[0]
  if (!base) throw new Error('no base document to combine')

  const combined: JsonRecord = {
    openapi: base.openapi,
    info: { ...(base.info as JsonRecord), title: 'Botruntime Combined API' },
    servers: base.servers,
    paths: mergePaths(combinedDocs),
    components: mergeComponents(combinedDocs),
    tags: mergeTags(combinedDocs),
  }
  fs.writeFileSync(path.join(OUT_DIR, 'openapi.json'), `${JSON.stringify(combined, null, 2)}\n`)

  const publicDoc = docs.public
  const publicPathCount = publicDoc ? Object.keys(publicDoc.paths as JsonRecord).length : 0
  console.log(`wrote ${SECTIONS.length} section specs + combined openapi.json to ${OUT_DIR}`)
  console.log(`public spec: ${publicPathCount} paths`)
}

main()
