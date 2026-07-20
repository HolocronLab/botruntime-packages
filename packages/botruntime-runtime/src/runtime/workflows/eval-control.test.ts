import { afterEach, describe, expect, it, vi } from 'vitest'
import { DurableEvalEffectRetryError } from '@holocronlab/botruntime-evals'
import { PlatformEvalEffects } from './eval-control'

describe('platform eval control', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the isolated dev authority and validates privacy-safe responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ virtualNow: '2026-07-20T00:00:00Z', releasedJobs: 2 }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const control = new PlatformEvalEffects({
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

  it('sends stable idempotency keys for durable table, event, and control effects', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [{ id: 41 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ event: { id: 'evt_41' } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ virtualNow: '2026-07-20T00:10:00Z', releasedJobs: 0 }), { status: 200 })
      )
    vi.stubGlobal('fetch', fetchMock)
    const effects = new PlatformEvalEffects({
      apiUrl: 'https://api.example',
      token: 'runtime-secret',
      runtimeBotId: 'dev_opaque',
    })

    await effects.createTableRows({
      table: 'Cases Table',
      rows: [{ caseId: 'case-1' }],
      effectId: 'eval:run-1:setup:table:0',
    })
    await effects.createEvent({
      type: 'eval:event',
      userId: 'user_1',
      conversationId: 'conv_1',
      payload: { type: 'hitl.approved' },
      effectId: 'eval:run-1:turn:2:event',
    })
    await effects.advanceClock({ milliseconds: 600_000 }, 'eval:run-1:turn:3:control:advance')

    expect(fetchMock.mock.calls.map(([url, init]) => [url, (init as RequestInit).headers])).toEqual([
      [
        'https://api.example/v1/tables/Cases%20Table/rows',
        expect.objectContaining({ 'idempotency-key': 'eval:run-1:setup:table:0' }),
      ],
      [
        'https://api.example/v1/chat/events',
        expect.objectContaining({ 'idempotency-key': 'eval:run-1:turn:2:event' }),
      ],
      [
        'https://api.example/v1/evals/control',
        expect.objectContaining({ 'idempotency-key': 'eval:run-1:turn:3:control:advance' }),
      ],
    ])
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual({
      type: 'eval:event',
      userId: 'user_1',
      conversationId: 'conv_1',
      payload: { type: 'hitl.approved' },
    })
  })

  it.each([
    ['network failure', () => Promise.reject(new Error('socket closed'))],
    ['HTTP 408', () => Promise.resolve(new Response('', { status: 408 }))],
    ['HTTP 429', () => Promise.resolve(new Response('', { status: 429 }))],
    ['HTTP 500', () => Promise.resolve(new Response('', { status: 500 }))],
  ])('marks an ambiguous %s as retryable without caching a false verdict', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(response))
    const effects = new PlatformEvalEffects({
      apiUrl: 'https://api.example',
      token: 'runtime-secret',
      runtimeBotId: 'dev_opaque',
    })

    await expect(
      effects.createTableRows({ table: 'Cases', rows: [{ id: 'case-1' }], effectId: 'eval:run-1:setup:table:0' })
    ).rejects.toBeInstanceOf(DurableEvalEffectRetryError)
  })

  it.each([
    ['invalid JSON', new Response('{', { status: 200 })],
    ['non-object JSON', new Response('[]', { status: 200 })],
    ['incomplete table response', new Response(JSON.stringify({ rows: [{ id: 1 }] }), { status: 200 })],
  ])('marks a malformed committed %s acknowledgement as retryable', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const effects = new PlatformEvalEffects({
      apiUrl: 'https://api.example',
      token: 'runtime-secret',
      runtimeBotId: 'dev_opaque',
    })

    await expect(
      effects.createTableRows({
        table: 'Cases',
        rows: [{ id: 'case-1' }, { id: 'case-2' }],
        effectId: 'eval:run-1:setup:table:0',
      })
    ).rejects.toBeInstanceOf(DurableEvalEffectRetryError)
  })

  it('fails closed without reflecting the response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('customer secret', { status: 403 })))
    const control = new PlatformEvalEffects({
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
    const control = new PlatformEvalEffects({
      apiUrl: 'https://api.example',
      token: 'runtime-secret',
      runtimeBotId: 'dev_opaque',
    })

    await expect(control.clearFaults()).rejects.toMatchObject({ kind })
    await expect(control.clearFaults()).rejects.not.toThrow(/private provider detail/)
  })
})
