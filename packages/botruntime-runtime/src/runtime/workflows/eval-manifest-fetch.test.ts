import { describe, expect, it, vi } from 'vitest'
import { fetchEvalManifestFile } from './eval-file-fetch'

const client = {
  config: {
    apiUrl: 'https://botruntime.ru',
    headers: {
      Authorization: 'Bearer runtime-secret',
      'x-bot-id': '23',
      'x-workspace-id': '2',
      'x-unrelated': 'must-not-forward',
    },
  },
}

describe('hosted eval manifest fetch', () => {
  it('forwards only client auth coordinates to same-origin file URLs', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }))

    await fetchEvalManifestFile(
      'https://botruntime.ru/v1/files/file_1/content',
      client as never,
      fetchFn as never,
    )

    const calls = fetchFn.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>
    const headers = new Headers(calls[0]![1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer runtime-secret')
    expect(headers.get('x-bot-id')).toBe('23')
    expect(headers.get('x-workspace-id')).toBe('2')
    expect(headers.get('x-unrelated')).toBeNull()
  })

  it('never forwards platform credentials to external file URLs', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }))

    await fetchEvalManifestFile('https://storage.example/file_1', client as never, fetchFn as never)

    const calls = fetchFn.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>
    const headers = new Headers(calls[0]![1]?.headers)
    expect([...headers]).toEqual([])
  })
})
