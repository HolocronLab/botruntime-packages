import * as http from 'node:http'
import type { AddressInfo } from 'node:net'

type TracePayload = {
  key: string
  contentType: 'application/json' | 'text/plain'
  value: string
}

type TraceRecord = {
  type: 'start' | 'end'
  traceId: string
  spanId: string
  parentSpanId?: string | null
  name: string
  startNs: number | string
  endNs?: number | string
  durationNs?: number | string
  status?: { code?: number; message?: string }
  attrs?: Record<string, unknown>
  payloads?: TracePayload[]
}

type LocalSpan = {
  id: { trace: string; span: string; parent: string | null }
  name: string
  label: string
  status: 'running' | 'ok' | 'error'
  error?: string
  timing: { startedAt: number; endedAt?: number; duration?: number }
  context: Record<string, string>
  tier: 'concise' | 'standard' | 'verbose'
  data: Record<string, unknown>
  resource: { environment: 'development'; versions: Record<string, string> }
}

type StreamClient = {
  response: http.ServerResponse
  attributeName?: string
  attributeValue?: string
}

const TRACE_ID = /^[0-9a-f]{32}$/i
const SPAN_ID = /^[0-9a-f]{16}$/i
const CONTEXT_ATTRIBUTES = ['botId', 'conversationId', 'userId', 'messageId', 'workflowId', 'eventId', 'integration', 'channel']
const TIERS = new Set(['concise', 'standard', 'verbose'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toMilliseconds(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined
  const nanoseconds = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(nanoseconds) && nanoseconds >= 0 ? nanoseconds / 1_000_000 : undefined
}

function parseRecord(value: unknown): TraceRecord | undefined {
  if (!isRecord(value)) return undefined
  if (value.type !== 'start' && value.type !== 'end') return undefined
  if (typeof value.traceId !== 'string' || !TRACE_ID.test(value.traceId)) return undefined
  if (typeof value.spanId !== 'string' || !SPAN_ID.test(value.spanId)) return undefined
  if (value.parentSpanId !== undefined && value.parentSpanId !== null && (typeof value.parentSpanId !== 'string' || !SPAN_ID.test(value.parentSpanId))) return undefined
  if (typeof value.name !== 'string' || value.name.length === 0 || value.name.length > 256) return undefined
  if (toMilliseconds(value.startNs as number | string | undefined) === undefined) return undefined
  if (value.attrs !== undefined && !isRecord(value.attrs)) return undefined
  if (value.payloads !== undefined && !Array.isArray(value.payloads)) return undefined
  return value as TraceRecord
}

function recordToSpan(record: TraceRecord): LocalSpan {
  const attrs = { ...(record.attrs ?? {}) }
  for (const payload of record.payloads ?? []) {
    if (
      isRecord(payload) &&
      typeof payload.key === 'string' &&
      payload.key.length > 0 &&
      payload.key.length <= 256 &&
      (payload.contentType === 'application/json' || payload.contentType === 'text/plain') &&
      typeof payload.value === 'string'
    ) {
      attrs[payload.key] = payload.value
    }
  }

  const context: Record<string, string> = {}
  for (const key of CONTEXT_ATTRIBUTES) {
    if (typeof attrs[key] === 'string') context[key] = attrs[key]
  }

  const startedAt = toMilliseconds(record.startNs)!
  const endedAt = toMilliseconds(record.endNs)
  const duration = toMilliseconds(record.durationNs)
  const status = record.type === 'start' ? 'running' : record.status?.code === 2 ? 'error' : 'ok'
  const tierValue = attrs['adk.tier']
  const tier = typeof tierValue === 'string' && TIERS.has(tierValue) ? (tierValue as LocalSpan['tier']) : 'standard'

  return {
    id: {
      trace: record.traceId.toLowerCase(),
      span: record.spanId.toLowerCase(),
      parent: record.parentSpanId?.toLowerCase() ?? null,
    },
    name: record.name,
    label: record.name,
    status,
    ...(status === 'error' && record.status?.message ? { error: record.status.message } : {}),
    timing: {
      startedAt,
      ...(endedAt === undefined ? {} : { endedAt }),
      ...(duration === undefined ? {} : { duration }),
    },
    context,
    tier,
    data: attrs,
    resource: { environment: 'development', versions: {} },
  }
}

function spanMatches(client: StreamClient, span: LocalSpan): boolean {
  if (!client.attributeName || !client.attributeValue) return true
  return span.context[client.attributeName] === client.attributeValue || span.data[client.attributeName] === client.attributeValue
}

function writeEvent(response: http.ServerResponse, event: string, data: unknown): void {
  if (!response.destroyed && !response.writableEnded) {
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
}

export class DevTraceIngestServer {
  private readonly spans = new Map<string, LocalSpan>()
  private readonly clients = new Set<StreamClient>()
  private readonly keepalive: ReturnType<typeof setInterval>
  private closePromise: Promise<void> | undefined

  private constructor(
    private readonly server: http.Server,
    readonly url: string,
    private readonly maxBodyBytes: number,
    // `brt dev --json`: stdout обязан нести только сырой JSON — worker-строки уходят в stderr.
    private readonly workerLogsToStderr: boolean
  ) {
    this.keepalive = setInterval(() => {
      for (const client of this.clients) writeEvent(client.response, 'keepalive', { at: Date.now() })
    }, 15_000)
    this.keepalive.unref?.()
  }

  static async start(options: { maxBodyBytes?: number; workerLogsToStderr?: boolean } = {}): Promise<DevTraceIngestServer> {
    const maxBodyBytes = options.maxBodyBytes ?? 4 * 1024 * 1024
    let instance: DevTraceIngestServer | undefined
    const server = http.createServer((request, response) => {
      void instance?.handle(request, response)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    const address = server.address() as AddressInfo
    instance = new DevTraceIngestServer(server, `http://127.0.0.1:${address.port}`, maxBodyBytes, options.workerLogsToStderr ?? false)
    return instance
  }

  async close(): Promise<void> {
    this.closePromise ??= new Promise<void>((resolve, reject) => {
      clearInterval(this.keepalive)
      for (const client of this.clients) client.response.end()
      this.clients.clear()
      this.server.close((error) => (error ? reject(error) : resolve()))
    })
    await this.closePromise
  }

  private async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', this.url)
    if (request.method === 'GET' && url.pathname === '/api/traces/stream') {
      this.openStream(url, request, response)
      return
    }
    if (request.method === 'POST' && url.pathname === '/v1/traces') {
      await this.ingest(request, response)
      return
    }
    if (request.method === 'POST' && url.pathname === '/v1/logs') {
      await this.renderWorkerLog(request, response)
      return
    }
    response.writeHead(404).end('Not found')
  }

  private openStream(url: URL, request: http.IncomingMessage, response: http.ServerResponse): void {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    })
    response.write('retry: 1000\n\n')
    const client: StreamClient = {
      response,
      attributeName: url.searchParams.get('attributeName') ?? undefined,
      attributeValue: url.searchParams.get('attributeValue') ?? undefined,
    }
    this.clients.add(client)
    writeEvent(response, 'snapshot', { spans: [...this.spans.values()].filter((span) => spanMatches(client, span)) })
    const remove = () => this.clients.delete(client)
    request.once('close', remove)
    response.once('close', remove)
  }

  private async ingest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const body = await this.readBody(request)
    if (body.status !== 200) {
      response.writeHead(body.status).end(body.message)
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(body.value)
    } catch {
      response.writeHead(400).end('Malformed JSON')
      return
    }
    const record = parseRecord(parsed)
    if (!record) {
      response.writeHead(400).end('Malformed trace record')
      return
    }
    const span = recordToSpan(record)
    this.spans.set(`${span.id.trace}:${span.id.span}`, span)
    for (const client of this.clients) {
      if (spanMatches(client, span)) writeEvent(client.response, 'update', { span })
    }
    response.writeHead(202).end()
  }

  // Worker console.* records are shipped here instead of the worker's stdout whenever
  // ADK_SPAN_INGEST_URL is set (structured-logging.ts). Discarding them made `brt dev`
  // a log black hole for agent bots: neither the terminal nor the cloud ingest ever saw
  // them (the cloud ingest is fed only by the production supervisor). Render each entry
  // to the dev terminal — errors/warnings to stderr, the rest to stdout.
  private async renderWorkerLog(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const body = await this.readBody(request)
    if (body.status !== 200) {
      response.writeHead(body.status).end(body.message)
      return
    }
    let entry: { timestamp?: string; type?: string; args?: unknown[] } | null = null
    try {
      entry = JSON.parse(body.value)
    } catch {}
    if (!entry || !Array.isArray(entry.args)) {
      response.writeHead(400).end('Malformed log entry')
      return
    }
    const line = `[worker] ${entry.args.map(String).join(' ')}\n`
    // Wire-типы из structured-logging: console.error шлёт 'stderr', console.warn — 'warn'.
    if (this.workerLogsToStderr || entry.type === 'stderr' || entry.type === 'warn') {
      process.stderr.write(line)
    } else {
      process.stdout.write(line)
    }
    response.writeHead(202).end()
  }


  private readBody(request: http.IncomingMessage): Promise<{ status: 200; value: string } | { status: 400 | 413; message: string }> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = []
      let size = 0
      let done = false
      const finish = (result: { status: 200; value: string } | { status: 400 | 413; message: string }) => {
        if (done) return
        done = true
        resolve(result)
      }
      request.on('data', (chunk: Buffer) => {
        size += chunk.byteLength
        if (size > this.maxBodyBytes) {
          finish({ status: 413, message: 'Payload too large' })
          return
        }
        chunks.push(chunk)
      })
      request.once('end', () => finish({ status: 200, value: Buffer.concat(chunks).toString('utf8') }))
      request.once('error', () => finish({ status: 400, message: 'Invalid request body' }))
    })
  }
}
