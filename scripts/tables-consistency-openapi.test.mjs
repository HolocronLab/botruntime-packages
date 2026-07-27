import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const specs = [
  'packages/botruntime-api/openapi/openapi.json',
  'packages/botruntime-api/openapi/public.json',
  'packages/botruntime-api/openapi/tables.json',
]

for (const specPath of specs) {
  test(`${specPath} publishes standalone Tables consistency operations`, () => {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))

    const reserve = spec.paths['/v1/tables/{table}/rows/reserve']?.post
    assert.equal(reserve?.operationId, 'reserveTableKey')
    assert.deepEqual(reserve.security, [{ BearerAuth: [] }])
    assert.deepEqual(
      reserve.parameters.map(({ name, in: location, required }) => ({
        name,
        in: location,
        required,
      })),
      [
        { name: 'table', in: 'path', required: true },
        { name: 'x-bot-id', in: 'header', required: true },
        { name: 'x-integration-id', in: 'header', required: false },
        { name: 'x-integration-alias', in: 'header', required: false },
        { name: 'x-integration-name', in: 'header', required: false },
        { name: 'x-user-id', in: 'header', required: false },
        { name: 'x-user-role', in: 'header', required: false },
        { name: 'x-workspace-id', in: 'header', required: false },
        { name: 'Idempotency-Key', in: 'header', required: true },
      ],
    )
    assert.deepEqual(
      reserve.requestBody.content['application/json'].schema.required,
      ['row'],
    )
    assert.deepEqual(
      reserve.responses['200'].content['application/json'].schema.required,
      ['row', 'created'],
    )
    assert.deepEqual(
      reserve.responses['200'].content['application/json'].schema.properties.row,
      { $ref: '#/components/schemas/Row' },
    )
    assert.equal(
      reserve.responses['200'].content['application/json'].schema.properties.created.type,
      'boolean',
    )
    assert.ok(reserve.responses['409'])
    assert.ok(reserve.responses['503'])

    const transition = spec.paths['/v1/tables/{table}/unique-key']?.put
    assert.equal(transition?.operationId, 'transitionTableUniqueKey')
    assert.deepEqual(transition.security, [{ BearerAuth: [] }])
    assert.deepEqual(
      transition.parameters.map(({ name, in: location, required }) => ({
        name,
        in: location,
        required,
      })),
      [
        { name: 'table', in: 'path', required: true },
        { name: 'x-bot-id', in: 'header', required: true },
        { name: 'x-integration-id', in: 'header', required: false },
        { name: 'x-integration-alias', in: 'header', required: false },
        { name: 'x-integration-name', in: 'header', required: false },
        { name: 'x-user-id', in: 'header', required: false },
        { name: 'x-user-role', in: 'header', required: false },
        { name: 'x-workspace-id', in: 'header', required: true },
      ],
    )
    assert.deepEqual(
      transition.requestBody.content['application/json'].schema.required,
      ['enabled'],
    )
    assert.equal(
      transition.requestBody.content['application/json'].schema.properties.enabled.type,
      'boolean',
    )
    for (const status of ['200', '202']) {
      const schema = transition.responses[status].content['application/json'].schema
      assert.deepEqual(schema.required, ['table'])
      assert.deepEqual(schema.properties.table, {
        $ref: '#/components/schemas/Table',
      })
    }
    assert.ok(transition.responses['409'])

    const createTable =
      spec.components.requestBodies.createTableBody.content['application/json'].schema
    assert.equal(createTable.properties.keyColumnUnique.type, 'boolean')
    const getOrCreateTable =
      spec.components.requestBodies.getOrCreateTableBody.content['application/json'].schema
    assert.equal(getOrCreateTable.properties.keyColumnUnique.type, 'boolean')
    for (const requestBody of [
      'createTableBody',
      'getOrCreateTableBody',
      'updateTableBody',
    ]) {
      const tableSchema =
        spec.components.requestBodies[requestBody].content['application/json'].schema
          .properties.schema
      assert.match(tableSchema.description, /maximum of 64 keys/i)
      assert.match(tableSchema.description, /system fields are excluded/i)
    }

    const table = spec.components.schemas.Table
    assert.equal(table.properties.keyColumnUnique.type, 'boolean')
    assert.equal(table.properties.keyColumnUniqueOperationId.nullable, true)
    assert.equal(table.properties.keyColumnUniqueLastErrorCode.nullable, true)
    assert.equal(table.properties.keyColumnUniqueLastError, undefined)
    assert.deepEqual(table.properties.keyColumnUniqueState.enum, [
      'disabled',
      'enabling',
      'enabled',
      'disabling',
      'error',
    ])
    assert.deepEqual(
      spec.components.schemas.Row.required,
      ['id', 'rowVersion', 'computed', 'createdAt', 'updatedAt'],
    )
    assert.deepEqual(spec.components.securitySchemes.BearerAuth, {
      type: 'http',
      scheme: 'bearer',
    })

    const atomic = spec.paths['/v1/tables/atomic']?.post
    assert.equal(atomic?.operationId, 'atomicTables')
    assert.deepEqual(atomic.security, [{ BearerAuth: [] }])
  })
}

test('generated clients preserve nullable unique-key diagnostics', () => {
  for (const section of ['public', 'tables']) {
    const models = fs.readFileSync(
      `packages/botruntime-client/src/gen/${section}/models.ts`,
      'utf8',
    )
    assert.match(models, /keyColumnUniqueOperationId\?: string \| null;/)
    assert.match(models, /keyColumnUniqueLastErrorCode\?: string \| null;/)
    for (const operation of ['createTable', 'getOrCreateTable', 'updateTable']) {
      const source = fs.readFileSync(
        `packages/botruntime-client/src/gen/${section}/operations/${operation}.ts`,
        'utf8',
      )
      assert.match(source, /maximum of 64 keys/i)
      assert.match(source, /system fields are excluded/i)
    }
  }
})
