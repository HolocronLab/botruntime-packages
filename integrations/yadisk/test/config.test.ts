import { describe, expect, test } from 'bun:test'
import { RuntimeError } from '@holocronlab/botruntime-sdk'
import definition from '../integration.definition'
import { clientFromConfig } from '../src/config'

describe('configuration runtime validation', () => {
  test('yadiskFolder rejects the same relative-path violations at runtime', () => {
    for (const yadiskFolder of ['app:/cases', 'disk:/cases', '../cases', 'cases/./x', 'cases/../x']) {
      expect(() => clientFromConfig({ yadiskToken: 'token', yadiskFolder })).toThrow(RuntimeError)
    }
  })

  test('empty and relative yadiskFolder values are accepted', () => {
    expect(() => clientFromConfig({ yadiskToken: 'token', yadiskFolder: '' })).not.toThrow()
    expect(() => clientFromConfig({ yadiskToken: 'token', yadiskFolder: 'cases/2026' })).not.toThrow()
  })

  test('non-string yadiskFolder values fail loud at runtime', () => {
    for (const yadiskFolder of [null, 42, { root: 'cases' }]) {
      expect(() => clientFromConfig({ yadiskToken: 'token', yadiskFolder } as any)).toThrow(RuntimeError)
    }
  })
})

describe('definition schema serialization', () => {
  test('all wire schemas can be transformed to JSON Schema for brt publish', () => {
    const schemas: Array<[string, { toJSONSchema: () => unknown }]> = []
    if (definition.configuration?.schema) {
      schemas.push(['configuration', definition.configuration.schema])
    }
    for (const [name, action] of Object.entries(definition.actions ?? {})) {
      schemas.push([`action ${name} input`, action.input.schema])
      schemas.push([`action ${name} output`, action.output.schema])
    }

    for (const [name, schema] of schemas) {
      expect(() => schema.toJSONSchema(), name).not.toThrow()
    }
  })
})
