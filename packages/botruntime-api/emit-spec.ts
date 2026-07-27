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

const systemNumberCondition: JsonRecord = {
  oneOf: [
    { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 },
    {
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: {
        $eq: { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 },
        $ne: { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 },
        $gt: { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 },
        $gte: { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 },
        $lt: { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 },
        $lte: { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 },
        $in: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 },
        },
        $nin: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 },
        },
      },
    },
  ],
}

const systemDateCondition: JsonRecord = {
  oneOf: [
    { type: 'string', format: 'date-time' },
    {
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: {
        $eq: { type: 'string', format: 'date-time' },
        $ne: { type: 'string', format: 'date-time' },
        $gt: { type: 'string', format: 'date-time' },
        $gte: { type: 'string', format: 'date-time' },
        $lt: { type: 'string', format: 'date-time' },
        $lte: { type: 'string', format: 'date-time' },
        $in: { type: 'array', items: { type: 'string', format: 'date-time' } },
        $nin: { type: 'array', items: { type: 'string', format: 'date-time' } },
      },
    },
  ],
}

function addSystemFilterContract(doc: JsonRecord): void {
  const components = doc.components as JsonRecord
  const schemas = components.schemas as JsonRecord
  schemas.TableSystemFilter = {
    type: 'object',
    description:
      'Mongo-like filter. System fields use a closed registry: id and rowVersion are positive safe integers; createdAt and updatedAt are RFC 3339 timestamps. Their only operators are $eq, $ne, $gt, $gte, $lt, $lte, $in and $nin. Other keys are declared user columns.',
    properties: {
      id: systemNumberCondition,
      rowVersion: systemNumberCondition,
      createdAt: systemDateCondition,
      updatedAt: systemDateCondition,
      $and: {
        type: 'array',
        items: { $ref: '#/components/schemas/TableSystemFilter' },
      },
      $or: {
        type: 'array',
        items: { $ref: '#/components/schemas/TableSystemFilter' },
      },
      $not: { $ref: '#/components/schemas/TableSystemFilter' },
    },
    additionalProperties: true,
  }

  const requestBodies = components.requestBodies as JsonRecord
  for (const name of ['findTableRowsBody', 'deleteTableRowsBody']) {
    const requestBody = requestBodies[name] as JsonRecord | undefined
    const content = requestBody?.content as JsonRecord | undefined
    const media = content?.['application/json'] as JsonRecord | undefined
    const schema = media?.schema as JsonRecord | undefined
    const properties = schema?.properties as JsonRecord | undefined
    if (!properties?.filter) {
      throw new Error(`local Tables contract drift: ${name}.filter is missing`)
    }
    properties.filter = { $ref: '#/components/schemas/TableSystemFilter' }
  }

  const findBody = requestBodies.findTableRowsBody as JsonRecord
  const findContent = findBody.content as JsonRecord
  const findMedia = findContent['application/json'] as JsonRecord
  const findSchema = findMedia.schema as JsonRecord
  const findProperties = findSchema.properties as JsonRecord
  const orderBy = findProperties.orderBy as JsonRecord
  orderBy.description =
    'User column or system field. System registry: id, rowVersion, createdAt, updatedAt. row_id remains a deprecated order-only alias for id. Non-id ordering appends id in the same direction as a deterministic tie-breaker.'
  orderBy['x-botruntime-system-values'] = [
    'id',
    'rowVersion',
    'createdAt',
    'updatedAt',
  ]
}

function addStandaloneTablesConsistencyContract(doc: JsonRecord): void {
  const components = doc.components as JsonRecord
  const securitySchemes = (components.securitySchemes ??= {}) as JsonRecord
  securitySchemes.BearerAuth = {
    type: 'http',
    scheme: 'bearer',
  }
  const schemas = components.schemas as JsonRecord
  const row = schemas.Row as JsonRecord
  row.required = ['id', 'rowVersion', 'computed', 'createdAt', 'updatedAt']
  const table = schemas.Table as JsonRecord
  const tableProperties = table.properties as JsonRecord
  const keyColumn = tableProperties.keyColumn as JsonRecord
  keyColumn.description =
    'Declares the semantic key column. Physical uniqueness is opt-in through keyColumnUnique and is never enabled implicitly for legacy tables.'
  Object.assign(tableProperties, {
    keyColumnUnique: {
      type: 'boolean',
      description: 'Whether the physical unique-key contract is desired for this table.',
    },
    keyColumnUniqueState: {
      type: 'string',
      enum: ['disabled', 'enabling', 'enabled', 'disabling', 'error'],
      description: 'Current durable unique-key contract state.',
    },
    keyColumnUniqueOperationId: {
      type: 'string',
      nullable: true,
      description: 'Current or last unique-key transition operation identifier.',
    },
    keyColumnUniqueAttempts: {
      type: 'integer',
      minimum: 0,
      description: 'Number of attempts made by the current unique-key transition.',
    },
    keyColumnUniqueLastErrorCode: {
      type: 'string',
      nullable: true,
      description: 'Stable error code from the latest failed unique-key transition.',
    },
    uniqueGeneration: {
      type: 'integer',
      minimum: 0,
      description: 'Monotonic generation of the physical unique-key contract.',
    },
    schemaGeneration: {
      type: 'integer',
      minimum: 0,
      description: 'Monotonic generation of the table schema contract.',
    },
  })

  const requestBodies = components.requestBodies as JsonRecord
  for (const name of ['createTableBody', 'getOrCreateTableBody']) {
    const requestBody = requestBodies[name] as JsonRecord
    const content = requestBody.content as JsonRecord
    const media = content['application/json'] as JsonRecord
    const schema = media.schema as JsonRecord
    const properties = schema.properties as JsonRecord
    const bodyKeyColumn = properties.keyColumn as JsonRecord
    bodyKeyColumn.description =
      'Declares the semantic key column. Set keyColumnUnique to true to opt a newly created table into physical uniqueness.'
    properties.keyColumnUnique = {
      type: 'boolean',
      default: false,
      description:
        'Opt-in physical unique-key contract for a newly created table. Existing tables are never changed implicitly.',
    }
  }

  const paths = doc.paths as JsonRecord
  const findPath = paths['/v1/tables/{table}/rows/find'] as JsonRecord
  const findPost = findPath.post as JsonRecord
  const tableParameter = (findPost.parameters as JsonRecord[])[0]
  if (tableParameter?.name !== 'table' || tableParameter.in !== 'path') {
    throw new Error('local Tables contract drift: table path parameter is missing')
  }
  const callbackParameters: JsonRecord[] = [
    { ...tableParameter },
    {
      name: 'x-bot-id',
      in: 'header',
      description: 'Bot id.',
      required: true,
      schema: { type: 'string' },
    },
    ...[
      ['x-integration-id', 'Integration id.'],
      ['x-integration-alias', 'Integration alias.'],
      ['x-integration-name', 'Integration name.'],
      ['x-user-id', 'User id.'],
      ['x-user-role', 'User role.'],
    ].map(([name, description]) => ({
      name,
      in: 'header',
      description,
      required: false,
      schema: { type: 'string' },
    })),
  ]
  const workspaceParameter = {
    name: 'x-workspace-id',
    in: 'header',
    description:
      'Workspace id. Required with a workspace PAT; omitted for a production bot API key.',
    required: false,
    schema: { type: 'string' },
  }

  paths['/v1/tables/{table}/rows/reserve'] = {
    post: {
      operationId: 'reserveTableKey',
      summary: 'Reserve a unique key and return the winner',
      description:
        'Atomically inserts a complete row under an enabled physical unique-key contract. Exactly one caller receives created=true; conflicts return the existing winner without a dummy update. Reusing the same Idempotency-Key with the same request replays the exact original result.',
      tags: ['documented'],
      security: [{ BearerAuth: [] }],
      parameters: [
        ...callbackParameters,
        workspaceParameter,
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          schema: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            pattern: '^[!-~]+$',
          },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['row'],
              properties: {
                row: {
                  type: 'object',
                  minProperties: 1,
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'The unique-key winner and whether this request created it.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['row', 'created'],
                properties: {
                  row: { $ref: '#/components/schemas/Row' },
                  created: { type: 'boolean' },
                },
              },
            },
          },
        },
        400: {
          description:
            'Missing idempotency key, malformed row, or invalid/missing/null/empty/oversized unique key.',
        },
        404: { description: 'Table not found.' },
        409: {
          description:
            'Idempotency-key reuse with a different request or a unique-key contract transition conflict.',
        },
        503: {
          description:
            'Bounded timeout or unknown commit outcome. Retry only as directed by metadata.retryable and metadata.recovery.',
        },
        default: {
          description:
            'Botruntime error envelope with stable metadata.errorCode, retryable, and recovery fields.',
        },
      },
    },
  }

  paths['/v1/tables/{table}/unique-key'] = {
    put: {
      operationId: 'transitionTableUniqueKey',
      summary: 'Enable or disable physical unique-key enforcement',
      description:
        'Starts or completes the durable unique-key state transition for a table. Requires an admin or deploy credential. Re-enabling is rejected while disabling cleanup is still in progress.',
      tags: ['documented'],
      security: [{ BearerAuth: [] }],
      parameters: [
        ...callbackParameters,
        {
          ...workspaceParameter,
          description:
            'Workspace id for the admin or deploy PAT. Required by this operation.',
          required: true,
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['enabled'],
              properties: {
                enabled: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'The transition completed synchronously.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['table'],
                properties: {
                  table: { $ref: '#/components/schemas/Table' },
                },
              },
            },
          },
        },
        202: {
          description: 'The transition continues asynchronously.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['table'],
                properties: {
                  table: { $ref: '#/components/schemas/Table' },
                },
              },
            },
          },
        },
        400: {
          description: 'Malformed request or the table has no valid keyColumn contract.',
        },
        403: {
          description: 'An admin or deploy credential is required.',
        },
        404: { description: 'Table not found.' },
        409: {
          description:
            'Duplicate existing keys, a conflicting contract change, or a transition already in use.',
        },
        503: {
          description: 'The bounded transition budget was exhausted. Inspect stable error metadata.',
        },
        default: {
          description:
            'Botruntime error envelope with stable metadata.errorCode, retryable, and recovery fields.',
        },
      },
    },
  }
}

function addAtomicTablesContract(doc: JsonRecord): void {
  const components = doc.components as JsonRecord
  const schemas = components.schemas as JsonRecord
  schemas.AtomicTableReference = {
    type: 'object',
    additionalProperties: false,
    required: ['$ref'],
    properties: {
      $ref: {
        type: 'object',
        additionalProperties: false,
        required: ['operation', 'path'],
        properties: {
          operation: { type: 'string', minLength: 1, maxLength: 64 },
          path: {
            type: 'string',
            description: 'RFC 6901 pointer into the result of an earlier named operation.',
          },
        },
      },
    },
  }
  const baseProperties = {
    id: {
      type: 'string',
      pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$',
      description: 'Optional name used by later RFC 6901 result references.',
    },
    table: { type: 'string', minLength: 1 },
  }
  const operation = (
    op: string,
    requiredField: string,
    fieldSchema: JsonRecord,
    optional: JsonRecord = {},
  ): JsonRecord => ({
    type: 'object',
    additionalProperties: false,
    required: ['op', 'table', requiredField],
    properties: {
      ...baseProperties,
      op: { type: 'string', enum: [op] },
      [requiredField]: fieldSchema,
      ...optional,
    },
  })
  schemas.AtomicTableOperation = {
    oneOf: [
      operation('reserveKey', 'row', {
        type: 'object',
        additionalProperties: true,
      }),
      operation('createRows', 'rows', {
        type: 'array',
        minItems: 1,
        items: { type: 'object', additionalProperties: true },
      }),
      operation('updateRows', 'rows', {
        type: 'array',
        minItems: 1,
        items: { type: 'object', additionalProperties: true },
      }),
      operation(
        'upsertRows',
        'rows',
        {
          type: 'array',
          minItems: 1,
          items: { type: 'object', additionalProperties: true },
        },
        { keyColumn: { type: 'string' } },
      ),
      operation('deleteRows', 'ids', {
        type: 'array',
        minItems: 1,
        items: {
          oneOf: [
            { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 },
            { $ref: '#/components/schemas/AtomicTableReference' },
          ],
        },
      }),
      operation('deleteRows', 'filter', {
        $ref: '#/components/schemas/TableSystemFilter',
      }),
    ],
  }
  schemas.AtomicTableOperationResult = {
    type: 'object',
    additionalProperties: false,
    required: ['operationIndex', 'op'],
    properties: {
      operationIndex: { type: 'integer', minimum: 0, maximum: 49 },
      id: { type: 'string' },
      op: {
        type: 'string',
        enum: ['reserveKey', 'createRows', 'updateRows', 'upsertRows', 'deleteRows'],
      },
      row: { type: 'object', additionalProperties: true },
      rows: { type: 'array', items: { type: 'object', additionalProperties: true } },
      created: { type: 'boolean' },
      inserted: { type: 'array', items: { type: 'object', additionalProperties: true } },
      updated: { type: 'array', items: { type: 'object', additionalProperties: true } },
      deletedRows: { type: 'integer', minimum: 0 },
    },
  }

  const paths = doc.paths as JsonRecord
  const findPath = paths['/v1/tables/{table}/rows/find'] as JsonRecord
  const findPost = findPath.post as JsonRecord
  const authParameters = (findPost.parameters as unknown[]).slice(1)
  paths['/v1/tables/atomic'] = {
    post: {
      operationId: 'atomicTables',
      summary: 'Execute atomic table operations',
      description:
        'Executes 1 to 50 ordered table operations in one READ COMMITTED PostgreSQL transaction. The required Idempotency-Key replays the exact original result. A failure rolls back every operation. Values may reference earlier named results with {$ref:{operation,path}} and an RFC 6901 path.',
      tags: ['documented'],
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          schema: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            pattern: '^[!-~]+$',
          },
        },
        ...authParameters,
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['operations'],
              properties: {
                operations: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 50,
                  items: { $ref: '#/components/schemas/AtomicTableOperation' },
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'The exact ordered batch result.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['results'],
                properties: {
                  results: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 50,
                    items: { $ref: '#/components/schemas/AtomicTableOperationResult' },
                  },
                },
              },
            },
          },
        },
        400: {
          description:
            'Invalid batch, idempotency key, filter, unique key, or result reference. Per-operation failures identify metadata.operationIndex.',
        },
        409: {
          description:
            'Idempotency-key reuse, row-version conflict, or unique-key conflict. Per-operation failures identify metadata.operationIndex.',
        },
        503: {
          description:
            'Bounded timeout, exhausted serialization/deadlock retry, or unknown commit outcome. Retry only as directed by metadata.retryable and metadata.recovery.',
        },
        default: {
          description:
            'Botruntime error envelope. Atomic operation failures include metadata.operationIndex and optional metadata.operationId.',
        },
      },
    },
  }
}

function applyLocalContracts(name: string, doc: JsonRecord): void {
  if (name !== 'public' && name !== 'tables') return
  addSystemFilterContract(doc)
  addStandaloneTablesConsistencyContract(doc)
  addAtomicTablesContract(doc)
}

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
    applyLocalContracts(name, doc)
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
