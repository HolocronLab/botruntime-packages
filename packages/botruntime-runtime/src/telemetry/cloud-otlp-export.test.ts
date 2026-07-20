import * as http from 'node:http'
import { ExportResultCode } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { afterEach, describe, expect, it } from 'vitest'
import { CloudSafeSpanExporter, cloudTraceHeaders } from './cloud-safe-span'
import { unsafeReadableSpan } from './cloud-safe-span.fixture'
import { registerSpanOmittedPayloads, registerSpanPayloads } from './trace-payloads'

describe('managed OTLP transport', () => {
  let server: http.Server | undefined

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve())
  })

  it('keeps the standard JSON OTLP envelope with canonical trace content', async () => {
    let received!: { url: string; headers: http.IncomingHttpHeaders; body: Buffer }
    const requestReceived = new Promise<void>((resolve) => {
      server = http.createServer((request, response) => {
        const chunks: Buffer[] = []
        request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        request.on('end', () => {
          received = { url: request.url ?? '', headers: request.headers, body: Buffer.concat(chunks) }
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end('{}')
          resolve()
        })
      })
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const address = server!.address()
    if (!address || typeof address === 'string') throw new Error('test server did not bind')
    const exporter = new CloudSafeSpanExporter(
      new OTLPTraceExporter({
        url: `http://127.0.0.1:${address.port}/v1/ingestion/traces/bot`,
        headers: cloudTraceHeaders({ token: 'pat-secret', development: true, runtimeBotId: 'dev_runtime' }),
      })
    )

    const sourceSpan = unsafeReadableSpan({
      attributes: {
        ...unsafeReadableSpan().attributes,
        'message.preview': 'private response preview',
        'autonomous.tool.output': '{"private":"tool output"}',
        'state.changed_keys': '["privateState"]',
        'state.previous_value': '{"privateState":"before"}',
        'state.value': '{"privateState":"after"}',
        conversation_id: 'alias-must-not-anchor',
        'langfuse.session.id': 'alias-must-not-anchor',
      },
    })
    registerSpanOmittedPayloads(sourceSpan, [
      { key: 'secret-cloud-payload-key', reason: 'too_large', sizeBytes: 88_888_888, maxSizeBytes: 10 },
    ])
    registerSpanPayloads(sourceSpan, [
      {
        key: 'ai.response',
        contentType: 'text/plain',
        value: 'full canonical model response',
        sizeBytes: 33,
      },
    ])
    const result = new Promise<number>((resolve) => {
      exporter.export([sourceSpan], (value) => resolve(value.code))
    })
    await requestReceived
    expect(await result).toBe(ExportResultCode.SUCCESS)

    expect(received.url).toBe('/v1/ingestion/traces/bot')
    expect(received.headers.authorization).toBe('Bearer pat-secret')
    expect(received.headers['x-bot-id']).toBe('dev_runtime')
    expect(received.headers['x-workspace-id']).toBeUndefined()
    expect(received.headers['content-type']).toContain('application/json')
    const envelope = JSON.parse(received.body.toString('utf8'))
    expect(envelope.resourceSpans).toHaveLength(1)
    expect(envelope.resourceSpans[0].resource?.attributes ?? []).toEqual([])
    const span = envelope.resourceSpans[0].scopeSpans[0].spans[0]
    expect(span.traceId).toBe('abcdef0123456789abcdef0123456789')
    expect(span.spanId).toBe('abcdef0123456789')
    expect(span.parentSpanId).toBeUndefined()
    expect(span.attributes).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'ai.model' })]))
    expect(span.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'conversationId', value: { stringValue: 'conv-safe_123' } }),
      ])
    )
    expect(span.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'payloads.omitted_count', value: { intValue: 1 } }),
      ])
    )
    expect(span.events ?? []).toEqual([])
    expect(span.links ?? []).toEqual([])
    expect(span.status?.message).toBeUndefined()
    expect(JSON.stringify(envelope)).not.toContain('secret')
    expect(JSON.stringify(envelope)).not.toContain('private response preview')
    expect(JSON.stringify(envelope)).toContain('developer trace message')
    expect(JSON.stringify(envelope)).toContain('lookup_account')
    expect(JSON.stringify(envelope)).not.toContain('tool output')
    expect(JSON.stringify(envelope)).not.toContain('privateState')
    expect(JSON.stringify(envelope)).not.toContain('alias-must-not-anchor')
    expect(JSON.stringify(envelope)).toContain('full canonical model response')
    expect(span.attributes.some((attribute: { key: string }) => attribute.key === 'userId')).toBe(false)
    expect(span.attributes.some((attribute: { key: string }) => attribute.key === 'messageId')).toBe(false)
    expect(span.attributes.some((attribute: { key: string }) => attribute.key === 'session.id')).toBe(false)
    expect(JSON.stringify(envelope)).not.toContain('88888888')

    await exporter.shutdown()
  })
})
