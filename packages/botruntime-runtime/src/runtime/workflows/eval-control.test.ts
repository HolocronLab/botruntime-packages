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
      workspaceId: '2',
    })

    await expect(control.advanceClock({ milliseconds: 72_000, runDueWorkflows: true })).resolves.toEqual({
      virtualNow: '2026-07-20T00:00:00Z',
      releasedJobs: 2,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/v1/evals/control',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer runtime-secret',
          'x-bot-id': 'dev_opaque',
          'x-workspace-id': '2',
        }),
      })
    )
  })

  it('fails closed without reflecting the response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('customer secret', { status: 403 })))
    const control = new PlatformEvalControl({
      apiUrl: 'https://api.example',
      token: 'runtime-secret',
      runtimeBotId: 'dev_opaque',
      workspaceId: '2',
    })
    await expect(control.clearFaults()).rejects.toThrow('HTTP 403')
    await expect(control.clearFaults()).rejects.not.toThrow(/customer secret/)
  })
})
