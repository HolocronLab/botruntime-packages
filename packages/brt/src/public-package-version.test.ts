import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLatestPublicVersion } from './public-package-version'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fetchLatestPublicVersion', () => {
  it('uses the explicit public registry without npmrc auth metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ 'dist-tags': { latest: '0.6.11' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchLatestPublicVersion('@holocronlab/brt', 'https://registry.npmjs.org', 250)
    ).resolves.toBe('0.6.11')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.npmjs.org/@holocronlab%2Fbrt',
      expect.objectContaining({
        headers: { accept: 'application/vnd.npm.install-v1+json' },
        signal: expect.any(AbortSignal),
      })
    )
    expect(fetchMock.mock.calls[0]![1]).not.toHaveProperty('authorization')
  })

  it('aborts a stalled registry request within the bounded timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        })
      })
    )

    const pending = fetchLatestPublicVersion('@holocronlab/brt', 'https://registry.npmjs.org/', 250)
    const rejected = expect(pending).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(250)
    await rejected
  })
})
