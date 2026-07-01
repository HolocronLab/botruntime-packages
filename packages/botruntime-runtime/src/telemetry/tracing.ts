import { trace as _trace } from '@opentelemetry/api'
import { SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpSpanExporter } from './http-span-exporter'
import { FilteredSpanProcessor } from './filtered-span-processor'
import { shutdownLogging } from './logging'
import { AsyncLocalStorageContextManager } from './context-manager'
import { installHttpClientInstrumentation } from './instrument-http'
import { Environment, getEnvironmentInfo } from '../environment'
import { getSingleton } from '../runtime/singletons'

// ============================================================================
// OpenTelemetry Setup
// ============================================================================

let spanProcessors: SpanProcessor[] = []
let httpExporter: HttpSpanExporter | null = null
let vortexSpanProcessor: SpanProcessor | null = null

if (Environment.isDevelopment()) {
  // Internal custom exporter → CLI span ingest server (auto-negotiated port)
  const spanIngestUrl = process.env.ADK_SPAN_INGEST_URL
  if (!spanIngestUrl) {
    console.warn('[tracing] ADK_SPAN_INGEST_URL is not set — HttpSpanExporter disabled')
  } else {
    httpExporter = new HttpSpanExporter(spanIngestUrl)
    spanProcessors.push(httpExporter)
  }

  // Standard OTLP exporter → external tools (Jaeger, otel-tui, etc.)
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (otlpEndpoint) {
    const base = otlpEndpoint.replace(/\/+$/, '').replace(/\/v1\/traces$/, '')
    const otlpExporter = new OTLPTraceExporter({ url: `${base}/v1/traces` })
    spanProcessors.push(new BatchSpanProcessor(otlpExporter))
  }
}

const VORTEX_EXPORTED_SPANS = new Set([
  'request.incoming',
  'handler.conversation',
  'handler.event',
  'handler.trigger',
  'handler.workflow',
  'autonomous.execution',
  'autonomous.iteration',
  'autonomous.tool',
  'chat.sendMessage',
  'state.saveAllDirty',
  'state.save',
  'cognitive.request',
])

const environmentInfo = getEnvironmentInfo()
const botName = process.env.BP_BOT_NAME || process.env.ADK_BOT_NAME
const botId = process.env.BP_BOT_ID || process.env.ADK_BOT_ID
const workspaceId = process.env.BP_WORKSPACE_ID || process.env.ADK_WORKSPACE_ID

// Production OTLP exporter → Vortex → managed ClickStack.
const bpApiUrl = process.env.BP_API_URL
const bpToken = process.env.BP_TOKEN || process.env.ADK_TOKEN
if (bpApiUrl) {
  const base = bpApiUrl.replace(/\/+$/, '')
  const vortexExporter = new OTLPTraceExporter({
    url: `${base}/v1/ingestion/traces/bot`,
    headers: {
      ...(bpToken ? { Authorization: `Bearer ${bpToken}` } : {}),
    },
  })
  vortexSpanProcessor = new FilteredSpanProcessor(new SimpleSpanProcessor(vortexExporter), VORTEX_EXPORTED_SPANS)
  spanProcessors.push(vortexSpanProcessor)
}
const resource = resourceFromAttributes({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spreading environment info into resource attributes
  ...(environmentInfo as any),
  'service.name': botName ? `bp_bot_${botName}` : 'bp_bot_unknown',
  ...(botId ? { botId } : {}),
  ...(workspaceId ? { workspaceId } : {}),
})

const provider = new NodeTracerProvider({
  spanProcessors,
  resource,
})

export const contextManager = getSingleton('__ADK_GLOBAL_CTX_TRACING', () =>
  new AsyncLocalStorageContextManager().enable()
)

provider.register({
  contextManager,
  propagator: new W3CTraceContextPropagator(),
})

// Only install HTTP instrumentation when NOT in command mode
if (!Environment.isCommand()) {
  installHttpClientInstrumentation({
    injectTraceHeader: true,
  })
}

export const tracer = _trace.getTracer('adk', '1.0.0')

// ============================================================================
// Silent Tracing
// ============================================================================

import { AsyncLocalStorage } from 'async_hooks'

const silentTracingFlag = getSingleton('__ADK_GLOBAL_SILENT_TRACING', () => new AsyncLocalStorage<boolean>())

/** Run a callback with tracing suppressed — no HTTP spans will be created */
export function withSilentTracing<T>(fn: () => T | Promise<T>): Promise<T> | T {
  return silentTracingFlag.run(true, fn)
}

/** Check if the current execution context has tracing suppressed */
export function isSilentTracing(): boolean {
  return silentTracingFlag.getStore() === true
}

export async function forceFlushTelemetry(): Promise<void> {
  await provider.forceFlush()
}

// ============================================================================
// Re-export Public API from span-helpers
// ============================================================================

export { span, createSpan } from './span-helpers'
export type { TypedSpan, DisposableSpan, SpanWithContext } from './span-helpers'
export type { Span, SpanId, SpanStatus, SpanTiming, SpanContext, SpanResource } from './span-type'

// ============================================================================
// Cleanup Handlers
// ============================================================================

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await provider.forceFlush()
    await provider.shutdown().catch(() => {})
    await httpExporter?.shutdown().catch(() => {})
    await vortexSpanProcessor?.shutdown().catch(() => {})
    await shutdownLogging().catch(() => {})
    process.exit(0)
  })
}
