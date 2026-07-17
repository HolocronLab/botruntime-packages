import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('renders worker log entries to the dev terminal instead of discarding them (DEVLP-165)', async () => {
    server = await DevTraceIngestServer.start()
    const outChunks: string[] = []
    const errChunks: string[] = []
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      outChunks.push(String(chunk))
      return true
    })
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      errChunks.push(String(chunk))
      return true
    })
    try {
      const info = await fetch(`${server.url}/v1/logs`, {
        method: 'POST',
        body: JSON.stringify({ timestamp: 't', type: 'stdout', args: ['hello', 'world'] }),
      })
      const err = await fetch(`${server.url}/v1/logs`, {
        method: 'POST',
        body: JSON.stringify({ timestamp: 't', type: 'error', args: ['boom'] }),
      })
      const malformed = await fetch(`${server.url}/v1/logs`, { method: 'POST', body: '{' })
      expect(info.status).toBe(202)
      expect(err.status).toBe(202)
      expect(malformed.status).toBe(400)
      expect(outChunks.join('')).toContain('[worker] hello world')
      expect(errChunks.join('')).toContain('[worker] boom')
    } finally {
      outSpy.mockRestore()
      errSpy.mockRestore()
    }
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
