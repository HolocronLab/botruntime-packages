import { describe, expect, test } from 'bun:test'
import definition from '../integration.definition'
import { actions } from '../definitions/actions'
import { configuration } from '../definitions/configuration'
import { normalizeConfiguration } from '../src/config'

describe('cloudconvert definition', () => {
  test('publishes the exact global ref and action contract', () => {
    expect(definition.name).toBe('cloudconvert')
    expect(definition.version).toBe('0.1.0')
    expect(Object.keys(definition.actions ?? {})).toEqual(['convertToPdf'])
    expect(definition.network).toEqual({
      providerHosts: [
        'api.cloudconvert.com',
        'sync.api.cloudconvert.com',
        'upload.cloudconvert.com',
        'storage.cloudconvert.com',
      ],
      ingressRelayed: false,
    })
  })

  test('all wire schemas serialize for brt publication', () => {
    expect(() => configuration.schema.toJSONSchema()).not.toThrow()
    expect(() => actions.convertToPdf.input.schema.toJSONSchema()).not.toThrow()
    expect(() => actions.convertToPdf.output.schema.toJSONSchema()).not.toThrow()
  })

  test('sourceFormat is closed and SHA-256 is exactly 64 hex characters', () => {
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
  test('trims a non-empty API key', () => {
    expect(normalizeConfiguration({ apiKey: '  provider-key  ' })).toEqual({ apiKey: 'provider-key' })
  })

  test('rejects missing and blank API keys', () => {
    expect(() => normalizeConfiguration({})).toThrow(/apiKey/)
    expect(() => normalizeConfiguration({ apiKey: '   ' })).toThrow(/apiKey/)
  })
})
