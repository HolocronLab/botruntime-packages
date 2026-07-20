import { trace as _trace } from '@opentelemetry/api'
import { SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpSpanExporter } from './http-span-exporter'
import { FilteredSpanProcessor } from './filtered-span-processor'
import {
  CloudSafeSpanExporter,
  VORTEX_EXPORTED_SPANS,
  cloudTraceHeaders,
  resolveCloudTraceEnvironment,
} from './cloud-safe-span'
import { shutdownLogging } from './logging'
import { AsyncLocalStorageContextManager } from './context-manager'
import { installHttpClientInstrumentation } from './instrument-http'
import { tracePropagationOrigin } from './trace-propagation'
import { Environment, getEnvironmentInfo } from '../environment'
import { getSingleton } from '../runtime/singletons'

// ============================================================================
// OpenTelemetry Setup
// ============================================================================

const spanProcessors: SpanProcessor[] = []

if (Environment.isDevelopment()) {
  // Internal custom exporter → CLI span ingest server (auto-negotiated port)
  const spanIngestUrl = process.env.ADK_SPAN_INGEST_URL
  if (spanIngestUrl) {
    try {
      spanProcessors.push(new HttpSpanExporter(spanIngestUrl))
    } catch (error) {
      console.warn(
        `[tracing] local span exporter disabled: ${error instanceof Error ? error.message : 'invalid loopback URL'}`
      )
    }
  }

  // Standard OTLP exporter → external tools (Jaeger, otel-tui, etc.)
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (otlpEndpoint) {
    const base = otlpEndpoint.replace(/\/+$/, '').replace(/\/v1\/traces$/, '')
    const otlpExporter = new OTLPTraceExporter({ url: `${base}/v1/traces` })
    spanProcessors.push(new BatchSpanProcessor(otlpExporter))
  }
}

const environmentInfo = getEnvironmentInfo()
const botName = process.env.BP_BOT_NAME || process.env.ADK_BOT_NAME
const cloudTraceEnvironment = resolveCloudTraceEnvironment(process.env)
const botId = cloudTraceEnvironment.runtimeBotId
const workspaceId = process.env.BP_WORKSPACE_ID || process.env.ADK_WORKSPACE_ID

// Production OTLP exporter → Vortex → managed ClickStack.
const bpApiUrl = cloudTraceEnvironment.apiUrl
const bpToken = cloudTraceEnvironment.token
if (bpApiUrl) {
  const base = bpApiUrl.replace(/\/+$/, '')
  try {
    const headers = cloudTraceHeaders({
      token: bpToken,
      development: Environment.isDevelopment(),
      runtimeBotId: botId,
    })
    const vortexExporter = new CloudSafeSpanExporter(
      new OTLPTraceExporter({
        url: `${base}/v1/ingestion/traces/bot`,
        headers,
      })
    )
    const vortexSpanProcessor = new FilteredSpanProcessor(
      new SimpleSpanProcessor(vortexExporter),
      VORTEX_EXPORTED_SPANS
    )
    spanProcessors.push(vortexSpanProcessor)
  } catch (error) {
    console.warn(`[tracing] managed trace exporter disabled: ${error instanceof Error ? error.message : 'invalid auth'}`)
  }
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

if (!Environment.isCommand()) {
  installHttpClientInstrumentation({
    injectTraceHeader: true,
    tracePropagationOrigin: tracePropagationOrigin(bpApiUrl),
  })
}

export const tracer = _trace.getTracer('brt', '1.0.0')

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
    await shutdownLogging().catch(() => {})
    process.exit(0)
  })
}
