import { afterEach, describe, expect, test, vi } from 'vitest'

import { Client, DownloadFileRefError, type ExactFileRef } from '..'

const fileRef: ExactFileRef = {
  id: 'cases/ДДУ + приложение.pdf',
  size: 6,
  contentType: 'application/pdf',
  filename: 'ДДУ + приложение.pdf',
  checksum: 'a'.repeat(64),
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('downloadFileRef', () => {
  test('returns the raw lazy stream and encodes the complete immutable generation', async () => {
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.enqueue(new Uint8Array([4, 5, 6]))
        controller.close()
      },
    })
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body, {
        status: 200,
        headers: { 'content-length': '6', 'content-type': 'application/pdf' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new Client({
      apiUrl: 'https://api.example.test/prefix',
      botId: 'bot-1',
      token: 'secret',
    })
    const opened = await client.downloadFileRef({ fileRef })

    expect(opened.stream).toBe(body)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe(
      'https://api.example.test/v1/files/download-ref'
      + '?id=cases%2F%D0%94%D0%94%D0%A3+%2B+%D0%BF%D1%80%D0%B8%D0%BB%D0%BE%D0%B6%D0%B5%D0%BD%D0%B8%D0%B5.pdf'
      + '&size=6&contentType=application%2Fpdf'
      + '&filename=%D0%94%D0%94%D0%A3+%2B+%D0%BF%D1%80%D0%B8%D0%BB%D0%BE%D0%B6%D0%B5%D0%BD%D0%B8%D0%B5.pdf'
      + `&checksum=${'a'.repeat(64)}`
    )
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret')
    expect(new Headers(init?.headers).get('x-bot-id')).toBe('bot-1')

    const reader = opened.stream.getReader()
    const bytes: number[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes.push(...value)
    }
    expect(bytes).toEqual([1, 2, 3, 4, 5, 6])
    expect(pulls).toBeGreaterThanOrEqual(1)
  })

  test('maps a bounded JSON error through the public API error contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'err-1',
          code: 409,
          type: 'Conflict',
          message: 'fileRef generation is stale',
          metadata: { errorCode: 'FILE_REF_STALE' },
        }),
        { status: 409 },
      )))

    const client = new Client({ apiUrl: 'https://api.example.test', botId: 'bot-1', token: 'secret' })
    const error = await client.downloadFileRef({ fileRef }).catch((thrown) => thrown)

    expect(error).toBeInstanceOf(DownloadFileRefError)
    expect(error).toMatchObject({
      status: 409,
      errorCode: 'FILE_REF_STALE',
      message: 'fileRef generation is stale',
    })
  })

  test('rejects a mismatched response length before handing the stream to a provider', async () => {
    const cancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '5' }),
      body: { cancel },
    })))

    const client = new Client({ apiUrl: 'https://api.example.test', botId: 'bot-1', token: 'secret' })
    await expect(client.downloadFileRef({ fileRef })).rejects.toThrow(/content-length/)
    expect(cancel).toHaveBeenCalledOnce()
  })

  test('accepts a zero-byte generation without buffering', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(null, { status: 200, headers: { 'content-length': '0' } })))
    const client = new Client({ apiUrl: 'https://api.example.test', botId: 'bot-1', token: 'secret' })

    const opened = await client.downloadFileRef({
      fileRef: { ...fileRef, size: 0 },
    })
    await expect(opened.stream.getReader().read()).resolves.toEqual({ done: true, value: undefined })
  })
})
