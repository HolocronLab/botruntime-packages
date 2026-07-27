import { describe, expect, test } from 'vitest'
import {
  FILE_REF_ADMISSION_METADATA_KEY,
  operationFileRef,
  type ExactFileRefSelectorV1,
  type ResolveCurrentFileRefInputV1,
} from './durable-operation'

describe('operationFileRef', () => {
  test('resolve-current admits only the bot-scoped id', () => {
    const schema = operationFileRef('resolve-current')
    const input = { id: 'cases/42/claim.pdf' } satisfies ResolveCurrentFileRefInputV1

    expect(schema.parse(input)).toEqual(input)
    expect(() => schema.parse({ ...input, generation: 'caller-forged' })).toThrow()
    expect(schema.getMetadata()[FILE_REF_ADMISSION_METADATA_KEY]).toEqual({
      version: 'v1',
      mode: 'resolve-current',
    })
  })

  test('exact requires generation without caller-authored metadata', () => {
    const schema = operationFileRef('exact')
    const input = {
      id: 'cases/42/claim.pdf',
      generation: '01K1GENERATION',
    } satisfies ExactFileRefSelectorV1

    expect(schema.parse(input)).toEqual(input)
    expect(() => schema.parse({ ...input, checksum: `sha256:${'a'.repeat(64)}` })).toThrow()
    expect(schema.getMetadata()[FILE_REF_ADMISSION_METADATA_KEY]).toEqual({
      version: 'v1',
      mode: 'exact',
    })
  })
})
