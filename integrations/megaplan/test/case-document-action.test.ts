import { expect, test } from 'bun:test'
import { publishCaseDocument as definition } from '../definitions/comment-actions'
import { publishCaseDocument } from '../src/actions/comment'

test('publishCaseDocument is a native durable-operation capability', () => {
  expect(definition.attributes).toMatchObject({
    'botruntime.durableOperation': 'v1',
    'botruntime.fileRefAdmission': 'schema-v1',
    'botruntime.operationCheckpoint': 'v1',
    'botruntime.operationCheckpoint.maxEntries': '17',
    'botruntime.operationCheckpoint.maxValueBytes': '512',
    'botruntime.operationCheckpoint.maxBytes': '12288',
  })
})

test('public operation input admits only a bot-scoped FileRef id', () => {
  const schema = definition.input.schema
  const base = {
    owner: 'deal',
    ownerId: 'D-42',
    contentHtml: '<p>Документ</p>',
    attachments: [{ fileRef: { id: 'cases/42/claim.pdf' } }],
  }
  expect(schema.parse(base)).toEqual(base)
  expect(() => schema.parse({
    ...base,
    attachments: [{
      fileRef: {
        id: 'cases/42/claim.pdf',
        checksum: 'caller-controlled',
      },
    }],
  })).toThrow()
  expect(() => schema.parse({
    ...base,
    attachments: [{
      fileRef: { id: 'cases/42/claim.pdf' },
      mimeType: ' \t ',
    }],
  })).toThrow()
  expect(() => schema.parse({
    ...base,
    attachments: [{
      fileRef: { id: 'cases/42/claim.pdf' },
      displayName: ' \t ',
    }],
  })).toThrow()
})

test('ordinary action invocation cannot become a byte, base64, or URL fallback', async () => {
  await expect(publishCaseDocument({} as never)).rejects.toThrow(
    /startIntegrationOperation.*immutable FileRef/i,
  )
})
