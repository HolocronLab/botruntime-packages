import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformEvalControl } from './eval-control'

describe('platform eval control', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the isolated dev authority and validates privacy-safe responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ virtualNow: '2026-07-20T00:00:00Z', releasedJobs: 2 }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const control = new PlatformEvalControl({
      apiUrl: 'https://api.example',
      token: 'runtime-secret',
      runtimeBotId: 'dev_opaque',
    })

    await expect(control.advanceClock({ milliseconds: 72_000, runDueWorkflows: true })).resolves.toEqual({
      virtualNow: '2026-07-20T00:00:00Z',
      releasedJobs: 2,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/v1/evals/control',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer runtime-secret',
          'content-type': 'application/json',
          'x-bot-id': 'dev_opaque',
        },
      })
    )
  })

  it('fails closed without reflecting the response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('customer secret', { status: 403 })))
    const control = new PlatformEvalControl({
      apiUrl: 'https://api.example',
      token: 'runtime-secret',
      runtimeBotId: 'dev_opaque',
    })
    await expect(control.clearFaults()).rejects.toMatchObject({ message: expect.stringContaining('HTTP 403'), kind: 'auth' })
    await expect(control.clearFaults()).rejects.not.toThrow(/customer secret/)
  })

  it.each([
    [404, 'configuration'],
    [504, 'timeout'],
    [500, 'upstream'],
  ] as const)('classifies HTTP %s as %s without reading the body', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider detail', { status })))
    const control = new PlatformEvalControl({
      apiUrl: 'https://api.example',
      token: 'runtime-secret',
      runtimeBotId: 'dev_opaque',
    })

    await expect(control.clearFaults()).rejects.toMatchObject({ kind })
    await expect(control.clearFaults()).rejects.not.toThrow(/private provider detail/)
  })
})
