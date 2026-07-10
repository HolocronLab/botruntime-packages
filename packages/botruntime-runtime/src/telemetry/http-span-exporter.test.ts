import { describe, expect, it, vi } from 'vitest'
import { unsafeReadableSpan } from './cloud-safe-span.fixture'
import { HttpSpanExporter } from './http-span-exporter'
import { registerSpanOmittedPayloads, registerSpanPayloads } from './trace-payloads'

describe('HttpSpanExporter', () => {
  it('posts rich local observation attributes to the loopback CLI and forceFlush drains the request', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchSpy = vi.fn().mockImplementation(async () => pending.then(() => new Response('{}', { status: 200 })))
    vi.stubGlobal('fetch', fetchSpy)
    const exporter = new HttpSpanExporter('http://127.0.0.1:38123/')

    const span = unsafeReadableSpan({
      name: 'autonomous.tool',
      attributes: {
        conversationId: 'conv-safe_123',
        'message.preview': 'private local response',
        'autonomous.tool.name': 'lookup_account',
        'autonomous.tool.input': '{"account":"private-account"}',
        'autonomous.tool.output': '{"balance":"private-balance"}',
        'state.changed_keys': '["privateState"]',
        'state.previous_value': '{"privateState":"before"}',
        'state.value': '{"privateState":"after"}',
      },
    })
    registerSpanOmittedPayloads(span, [
      { key: 'secret-local-payload-key', reason: 'too_large', sizeBytes: 99_999_999, maxSizeBytes: 10 },
    ])
    registerSpanPayloads(span, [
      {
        key: 'autonomous.tool.input.full',
        contentType: 'application/json',
        value: '{"private":"full local payload"}',
        sizeBytes: 32,
      },
    ])
    exporter.onEnd(span)
    let flushed = false
    const flush = exporter.forceFlush().then(() => {
      flushed = true
    })
    await Promise.resolve()
    expect(flushed).toBe(false)
    release()
    await flush

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:38123/v1/traces')
    const body = JSON.parse(String(init.body))
    expect(body.attrs).toEqual(
      expect.objectContaining({
        conversationId: 'conv-safe_123',
        'message.preview': 'private local response',
        'autonomous.tool.name': 'lookup_account',
        'autonomous.tool.input': '{"account":"private-account"}',
        'autonomous.tool.output': '{"balance":"private-balance"}',
        'state.changed_keys': '["privateState"]',
        'state.previous_value': '{"privateState":"before"}',
        'state.value': '{"privateState":"after"}',
      })
    )
    expect(body).not.toHaveProperty('resource')
    expect(body).not.toHaveProperty('events')
    expect(body).not.toHaveProperty('links')
    expect(body.payloads).toEqual([
      {
        key: 'autonomous.tool.input.full',
        contentType: 'application/json',
        value: '{"private":"full local payload"}',
        sizeBytes: 32,
      },
    ])
    expect(body).not.toHaveProperty('omittedPayloads')
    expect(body.status).toEqual({ code: 2 })
    expect(JSON.stringify(body)).not.toContain('secret-local-payload-key')
    expect(JSON.stringify(body)).not.toContain('99999999')

    vi.unstubAllGlobals()
  })

  it('caps local payload entries and never serializes omitted-payload registry details', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const exporter = new HttpSpanExporter('http://127.0.0.1:38123')
    const span = unsafeReadableSpan()
    registerSpanPayloads(span, [
      {
        key: 'oversized-local-payload',
        contentType: 'text/plain',
        value: 'x'.repeat(1_048_577),
        sizeBytes: 1_048_577,
      },
    ])
    registerSpanOmittedPayloads(span, [
      { key: 'omitted-secret-key', reason: 'too_large', sizeBytes: 99_999_999, maxSizeBytes: 10 },
    ])

    exporter.onEnd(span)
    await exporter.forceFlush()

    const bodyText = String(fetchSpy.mock.calls[0]![1]!.body)
    const body = JSON.parse(bodyText)
    expect(body).not.toHaveProperty('payloads')
    expect(body).not.toHaveProperty('omittedPayloads')
    expect(bodyText).not.toContain('oversized-local-payload')
    expect(bodyText).not.toContain('omitted-secret-key')
    expect(bodyText).not.toContain('99999999')
    expect(new TextEncoder().encode(bodyText).byteLength).toBeLessThanOrEqual(4 * 1024 * 1024)

    vi.unstubAllGlobals()
  })

  it('aborts a request after five seconds and shutdown closes the exporter before draining', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    vi.stubGlobal('fetch', fetchSpy)
    const exporter = new HttpSpanExporter('http://localhost:38123')

    exporter.onEnd(unsafeReadableSpan())
    const shutdown = exporter.shutdown()
    await vi.advanceTimersByTimeAsync(5_000)
    await shutdown
    exporter.onEnd(unsafeReadableSpan())

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).signal?.aborted).toBe(true)

    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each(['http://localhost:38123', 'http://127.0.0.1:38123', 'http://[::1]:38123'])(
    'accepts an explicit loopback HTTP ingest endpoint: %s',
    (url) => {
      expect(() => new HttpSpanExporter(url)).not.toThrow()
    }
  )

  it.each([
    'https://localhost:38123',
    'http://localhost',
    'http://127.0.0.2:38123',
    'http://0.0.0.0:38123',
    'http://example.test:38123',
    'http://user:password@localhost:38123',
    'http://localhost:38123/private',
    'http://localhost:38123?target=cloud',
    'not-a-url',
  ])('rejects a non-private local ingest endpoint before any export: %s', (url) => {
    expect(() => new HttpSpanExporter(url)).toThrow(/loopback|http|port|credentials|origin|url/i)
  })
})
