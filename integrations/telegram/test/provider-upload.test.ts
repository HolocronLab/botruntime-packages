import { afterEach, expect, test } from 'bun:test'
import { TelegramError } from 'telegraf'
import { sendDocumentUpload } from '../src/misc/provider-upload'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('uploads a buffered DOCX as native multipart and returns the provider ACK', async () => {
  const source = Buffer.alloc(40_524, 0x5a)
  globalThis.fetch = (async (input, init) => {
    expect(String(input)).toBe('https://api.telegram.org/bot123:TEST/sendDocument')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.get('chat_id')).toBe('144997264')
    expect(form.get('message_thread_id')).toBe('316')
    expect(form.get('caption')).toBe('Претензия')
    const file = form.get('document') as File
    expect(file.name).toBe('Претензия.docx')
    expect(file.size).toBe(source.byteLength)
    expect(Buffer.from(await file.arrayBuffer())).toEqual(source)
    return Response.json({
      ok: true,
      result: { message_id: 42, date: 1, chat: { id: 144997264, type: 'private' }, document: { file_id: 'f', file_unique_id: 'u' } },
    })
  }) as typeof fetch

  const result = await sendDocumentUpload({
    botToken: '123:TEST',
    chatId: 144997264,
    media: { source, filename: 'Претензия.docx' },
    caption: 'Претензия',
    messageThreadId: 316,
  })

  expect(result.message_id).toBe(42)
})

test('preserves a definitive Telegram rejection as TelegramError', async () => {
  globalThis.fetch = (async () =>
    Response.json({ ok: false, error_code: 400, description: 'Bad Request: wrong file identifier' }, { status: 400 })) as unknown as typeof fetch

  const error = await sendDocumentUpload({
    botToken: '123:TEST',
    chatId: 1,
    media: { source: Buffer.from('docx'), filename: 'claim.docx' },
  }).catch((value) => value)

  expect(error).toBeInstanceOf(TelegramError)
  expect((error as TelegramError).code).toBe(400)
})

test('redacts the bot token from transport errors', async () => {
  globalThis.fetch = (async () => {
    throw new Error('request to https://api.telegram.org/bot123:SECRET/sendDocument failed')
  }) as unknown as typeof fetch

  const error = await sendDocumentUpload({
    botToken: '123:SECRET',
    chatId: 1,
    media: { source: Buffer.from('docx'), filename: 'claim.docx' },
  }).catch((value) => value)

  expect(error).toBeInstanceOf(Error)
  expect(String(error)).not.toContain('123:SECRET')
})

test('treats an invalid success response as an unknown transport outcome', async () => {
  globalThis.fetch = (async () => new Response('not-json', { status: 200 })) as unknown as typeof fetch

  const error = await sendDocumentUpload({
    botToken: '123:TEST',
    chatId: 1,
    media: { source: Buffer.from('docx'), filename: 'claim.docx' },
  }).catch((value) => value)

  expect(error).toBeInstanceOf(Error)
  expect(error).not.toBeInstanceOf(TelegramError)
})
