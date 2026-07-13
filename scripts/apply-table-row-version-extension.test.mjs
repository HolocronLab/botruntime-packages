import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extendGeneratedClientSource,
  extendOpenApiDocument,
} from './apply-table-row-version-extension.mjs'

test('extends the canonical Row and CAS request schemas', () => {
  const document = {
    components: {
      schemas: {
        Row: { properties: { id: { type: 'number' } }, required: ['id'] },
      },
      requestBodies: {
        updateTableRowsBody: {
          content: {
            'application/json': {
              schema: { properties: { rows: { items: { properties: { id: { type: 'number' } } } } } },
            },
          },
        },
      },
    },
  }

  extendOpenApiDocument(document)

  assert.equal(document.components.schemas.Row.properties.rowVersion.type, 'integer')
  assert.deepEqual(document.components.schemas.Row.required, ['id', 'rowVersion'])
  assert.equal(
    document.components.requestBodies.updateTableRowsBody.content['application/json'].schema.properties.rows.items
      .properties.rowVersion.minimum,
    1
  )
})

test('extends generated response and update request row types', () => {
  const source = `export interface Response {
  row: {
    id: number;
    /**
     * Timestamp of row creation.
     */
    createdAt?: string;
    [k: string]: any;
  };
}
export interface Request {
  rows: {
    id: number;
    [k: string]: any;
  }[];
}
`

  const extended = extendGeneratedClientSource(source, { requestRowVersion: true })

  assert.match(extended, /rowVersion: number;/)
  assert.match(extended, /rowVersion\?: number;/)
})
