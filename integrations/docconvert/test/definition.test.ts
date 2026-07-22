import { describe, expect, test } from 'bun:test'
import definition from '../integration.definition'
import { actions } from '../definitions/actions'
import { configuration } from '../definitions/configuration'
import { normalizeConfiguration } from '../src/config'

describe('docconvert definition', () => {
  test('publishes the exact global ref and action contract', () => {
    expect(definition.name).toBe('docconvert')
    expect(definition.version).toBe('0.1.0')
    expect(Object.keys(definition.actions ?? {})).toEqual(['convertToPdf'])
    expect(definition.network).toEqual({ providerHosts: [], ingressRelayed: false })
  })

  test('all wire schemas serialize for brt publish', () => {
    expect(() => configuration.schema.toJSONSchema()).not.toThrow()
    expect(() => actions.convertToPdf.input.schema.toJSONSchema()).not.toThrow()
    expect(() => actions.convertToPdf.output.schema.toJSONSchema()).not.toThrow()
  })

  test('sourceFormat is a closed enum and SHA-256 is exactly 64 hex characters', () => {
    const valid = {
      fileUrl: 'https://botruntime.example/v1/files/download?key=claim.docx',
      sha256: 'a'.repeat(64),
      sourceFormat: 'docx',
    }
    expect(actions.convertToPdf.input.schema.safeParse(valid).success).toBe(true)
    expect(actions.convertToPdf.input.schema.safeParse({ ...valid, sourceFormat: 'doc' }).success).toBe(false)
    expect(actions.convertToPdf.input.schema.safeParse({ ...valid, sha256: 'a'.repeat(63) }).success).toBe(false)
  })
})

describe('sealed configuration', () => {
  test('accepts HTTPS and normalizes the base URL', () => {
    expect(normalizeConfiguration({ serviceUrl: 'https://convert.internal/root/' })).toEqual({
      serviceUrl: 'https://convert.internal/root',
      authToken: undefined,
    })
  })

  test('rejects missing, HTTP, credential-bearing and query-bearing service URLs', () => {
    for (const serviceUrl of [
      undefined,
      '',
      'http://convert.internal',
      'https://user:pass@convert.internal',
      'https://convert.internal?target=other',
    ]) {
      expect(() => normalizeConfiguration({ serviceUrl })).toThrow(/конфигурац/)
    }
  })
})
