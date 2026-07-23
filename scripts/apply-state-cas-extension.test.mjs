import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extendGeneratedStateModel,
  extendGeneratedStateOperation,
  extendOpenApiDocument,
} from './apply-state-cas-extension.mjs'

test('extends state schemas with an optional opaque version and optional CAS inputs', () => {
  const document = {
    components: {
      schemas: {
        State: {
          properties: {
            id: { type: 'string' },
            updatedAt: { type: 'string' },
            payload: { type: 'object' },
          },
          required: ['id', 'updatedAt', 'payload'],
        },
      },
      requestBodies: {
        setStateBody: {
          content: {
            'application/json': {
              schema: {
                properties: {
                  payload: { type: 'object' },
                  expiry: { type: 'number' },
                },
                required: ['payload'],
              },
            },
          },
        },
        patchStateBody: {
          content: {
            'application/json': {
              schema: {
                properties: {
                  payload: { type: 'object' },
                },
                required: ['payload'],
              },
            },
          },
        },
      },
    },
  }

  extendOpenApiDocument(document)

  assert.deepEqual(Object.keys(document.components.schemas.State.properties), [
    'id',
    'updatedAt',
    'version',
    'payload',
  ])
  assert.equal(document.components.schemas.State.properties.version.minimum, 1)
  assert.deepEqual(document.components.schemas.State.required, ['id', 'updatedAt', 'payload'])
  assert.equal(
    document.components.requestBodies.setStateBody.content['application/json'].schema.properties.expectedVersion.minimum,
    0
  )
  assert.equal(
    document.components.requestBodies.patchStateBody.content['application/json'].schema.properties.expectedVersion.minimum,
    0
  )
  assert.deepEqual(
    document.components.requestBodies.setStateBody.content['application/json'].schema.required,
    ['payload']
  )

  const once = JSON.stringify(document)
  extendOpenApiDocument(document)
  assert.equal(JSON.stringify(document), once, 'extension must be idempotent')
})

test('extends every state response and only adds CAS inputs to set/patch operations', () => {
  const operation = (name) => `export interface ${name}RequestBody {
  payload: { [k: string]: any };
}

export type ${name}Input = ${name}RequestBody

export const parseReq = (input: ${name}Input) => ({
  body: { 'payload': input['payload'] },
})

export interface ${name}Response {
  state: {
    updatedAt: string;
    payload: { [k: string]: any };
  };
}
`

  const set = extendGeneratedStateOperation(operation('SetState'), 'SetState')
  assert.match(set, /expectedVersion\?: number;/)
  assert.match(set, /'expectedVersion': input\['expectedVersion'\]/)
  assert.match(set, /version\?: number;/)
  assert.equal(extendGeneratedStateOperation(set, 'SetState'), set, 'extension must be idempotent')

  const patch = extendGeneratedStateOperation(operation('PatchState'), 'PatchState')
  assert.match(patch, /expectedVersion\?: number;/)
  assert.match(patch, /version\?: number;/)

  const get = extendGeneratedStateOperation(operation('GetState'), 'GetState')
  assert.doesNotMatch(get, /expectedVersion/)
  assert.match(get, /version\?: number;/)

  const expiry = extendGeneratedStateOperation(operation('SetStateExpiry'), 'SetStateExpiry')
  assert.doesNotMatch(expiry, /expectedVersion/)
  assert.match(expiry, /version\?: number;/)
})

test('extends only the generated State model', () => {
  const source = `export interface Conversation {
  updatedAt: string;
  version?: number;
}

export interface State {
  id: string;
  updatedAt: string;
  payload: { [k: string]: any };
}
`
  const extended = extendGeneratedStateModel(source)
  assert.match(extended.slice(0, extended.indexOf('export interface State')), /version\?: number;/)
  assert.match(extended, /export interface State \{[\s\S]*version\?: number;/)
  assert.equal(extendGeneratedStateModel(extended), extended, 'extension must be idempotent')
})
