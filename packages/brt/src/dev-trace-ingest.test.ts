import { afterEach, describe, expect, it } from 'vitest'
import { LocalSpanSource } from '@holocronlab/botruntime-evals/spans'
import { DevTraceIngestServer } from './dev-trace-ingest'

const TRACE_ID = '0123456789abcdef0123456789abcdef'
const SPAN_ID = '0123456789abcdef'

describe('DevTraceIngestServer', () => {
  let server: DevTraceIngestServer | undefined

  afterEach(async () => {
    await server?.close()
  })

  it('streams rich loopback spans to the hosted development eval collector', async () => {
    server = await DevTraceIngestServer.start()
    expect(new URL(server.url).hostname).toBe('127.0.0.1')

    const source = new LocalSpanSource(server.url)
    await source.connect({ conversationId: 'conv_1' })

    const base = {
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      parentSpanId: null,
      name: 'autonomous.tool',
      kind: 0,
      startNs: 1_000_000_000,
      attrs: {
        conversationId: 'conv_1',
        'autonomous.tool.name': 'lookup_case',
        'adk.tier': 'standard',
      },
      payloads: [
        {
          key: 'autonomous.tool.input',
          contentType: 'application/json',
          value: '{"caseId":"42"}',
          sizeBytes: 15,
        },
      ],
    }

    expect(
      await fetch(`${server.url}/v1/traces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'start', ...base }),
      })
    ).toMatchObject({ ok: true })
    expect(
      await fetch(`${server.url}/v1/traces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'end',
          ...base,
          endNs: 1_250_000_000,
          durationNs: 250_000_000,
          status: { code: 1 },
        }),
      })
    ).toMatchObject({ ok: true })

    await expect
      .poll(() => source.getAllSpans().find((span) => span.id.span === SPAN_ID)?.status)
      .toBe('ok')
    expect(source.getAllSpans()).toContainEqual(
      expect.objectContaining({
        name: 'autonomous.tool',
        status: 'ok',
        context: expect.objectContaining({ conversationId: 'conv_1' }),
        data: expect.objectContaining({
          'autonomous.tool.name': 'lookup_case',
          'autonomous.tool.input': '{"caseId":"42"}',
        }),
      })
    )
    source.disconnect()
  })

  it('rejects malformed and oversized trace payloads without breaking the stream', async () => {
    server = await DevTraceIngestServer.start({ maxBodyBytes: 128 })

    const malformed = await fetch(`${server.url}/v1/traces`, { method: 'POST', body: '{' })
    expect(malformed.status).toBe(400)

    const oversized = await fetch(`${server.url}/v1/traces`, { method: 'POST', body: 'x'.repeat(129) })
    expect(oversized.status).toBe(413)

    await server.close()
    await expect(server.close()).resolves.toBeUndefined()
  })
})
