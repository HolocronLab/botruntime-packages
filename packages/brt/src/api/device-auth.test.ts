import { afterEach, describe, expect, it, vi } from 'vitest'
import { deviceAuthenticate } from './device-auth'

const API = 'https://api.example.test'

const START = {
  deviceCode: 'dev-123',
  userCode: 'WXYZ-1234',
  verificationUri: 'https://api.example.test/activate',
  verificationUriComplete: 'https://api.example.test/activate?code=WXYZ-1234',
  expiresIn: 300,
  interval: 5,
}

const noopLogger = { log: () => {}, debug: () => {} }
const noopDeps = { logger: noopLogger, openUrl: () => {}, sleep: async () => {} }
const originalFetch = globalThis.fetch

// Builds a fetch stub whose successive calls return the given JSON payloads.
// First call is /device/start, the rest are /device/token polls.
const fetchReturning = (...payloads: Array<{ ok?: boolean; status?: number; body: unknown }>) => {
  let i = 0
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const p = payloads[Math.min(i, payloads.length - 1)]!
    i++
    return {
      ok: p.ok ?? true,
      status: p.status ?? 200,
      text: async () => JSON.stringify(p.body),
    } as Response
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('deviceAuthenticate', () => {
  it('returns the PAT once the poll reports complete (after pending)', async () => {
    const fetchMock = fetchReturning(
      { body: START },
      { body: { status: 'pending' } },
      { body: { status: 'complete', token: 'pat-abc' } }
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const token = await deviceAuthenticate(API, noopDeps)

    expect(token).toBe('pat-abc')
    // 1 start + 2 token polls
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [startUrl, startInit] = fetchMock.mock.calls[0]!
    expect(startUrl).toBe(`${API}/v1/admin/cli/device/start`)
    expect(JSON.parse(startInit!.body as string)).toEqual({ clientName: 'brt' })
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[1]!
    expect(tokenUrl).toBe(`${API}/v1/admin/cli/device/token`)
    expect(JSON.parse(tokenInit!.body as string)).toEqual({ deviceCode: 'dev-123' })
  })

  it.each([
    ['expired', /expired/],
    ['consumed', /already used/],
    ['invalid', /invalid/],
  ] as const)('throws a loud error on status=%s', async (status, expected) => {
    globalThis.fetch = fetchReturning({ body: START }, { body: { status } }) as unknown as typeof fetch
    await expect(deviceAuthenticate(API, noopDeps)).rejects.toThrow(expected)
  })

  it('throws when the server reports complete but omits the token', async () => {
    globalThis.fetch = fetchReturning({ body: START }, { body: { status: 'complete' } }) as unknown as typeof fetch
    await expect(deviceAuthenticate(API, noopDeps)).rejects.toThrow(/no token/)
  })

  it('surfaces an actionable error (pointing at --token) when device auth is unavailable (404)', async () => {
    globalThis.fetch = fetchReturning({
      ok: false,
      status: 404,
      body: { error: 'not found' },
    }) as unknown as typeof fetch
    await expect(deviceAuthenticate(API, noopDeps)).rejects.toThrow(/--token/)
  })

  it('throws loud (never a timeout-less busy-loop) when /start omits interval/expiresIn', async () => {
    // A 200 that drops the cadence/timeout fields must fail loud, not NaN into a
    // tight poll loop with a dead deadline guard.
    globalThis.fetch = fetchReturning({
      body: { deviceCode: 'd', userCode: 'u', verificationUri: 'v', verificationUriComplete: 'vc' },
    }) as unknown as typeof fetch
    await expect(deviceAuthenticate(API, noopDeps)).rejects.toThrow(/invalid response|positive numbers/)
  })

  it('throws a loud timeout once expiresIn elapses without authorization', async () => {
    // deadline = Date.now() + expiresIn*1000; the post-sleep check must fire once
    // the clock passes it. START.expiresIn=300 → deadline 300_000.
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValueOnce(0) // deadline computation
    nowSpy.mockReturnValue(301_000) // every subsequent check is past the deadline
    globalThis.fetch = fetchReturning({ body: START }, { body: { status: 'pending' } }) as unknown as typeof fetch
    await expect(deviceAuthenticate(API, noopDeps)).rejects.toThrow(/timed out/)
  })

  it('honors a server slow_down by adopting the returned interval', async () => {
    const sleep = vi.fn(async () => {})
    const fetchMock = fetchReturning(
      { body: START }, // interval 5s
      { body: { status: 'pending', interval: 12 } }, // slow_down -> 12s
      { body: { status: 'complete', token: 'pat-xyz' } }
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const token = await deviceAuthenticate(API, { ...noopDeps, sleep })

    expect(token).toBe('pat-xyz')
    // first poll waited the start interval (5s), second waited the slow_down (12s)
    expect(sleep).toHaveBeenNthCalledWith(1, 5000)
    expect(sleep).toHaveBeenNthCalledWith(2, 12000)
  })
})
