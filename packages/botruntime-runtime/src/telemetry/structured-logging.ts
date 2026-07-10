import { trace as otelTrace, context as otelContext } from '@opentelemetry/api'
import safeStringify from 'fast-safe-stringify'
import { LOG_DELIMITER } from '../consts'
import { HttpLogExporter, type StructuredLogEntry } from './http-log-exporter'
import { postJsonToCli } from './cli-transport'
import { emitOtelLog } from './logging'

type LogLevel = StructuredLogEntry['type']

/**
 * Get the current span and trace IDs from the active OpenTelemetry context
 */
function getTraceContext(): { spanId?: string; traceId?: string } {
  try {
    const activeContext = otelContext.active()
    const span = otelTrace.getSpan(activeContext)

    if (!span) {
      return {}
    }

    const spanContext = span.spanContext()
    if (!spanContext) {
      return {}
    }

    return {
      spanId: spanContext.spanId,
      traceId: spanContext.traceId,
    }
  } catch {
    return {}
  }
}

/**
 * Serialize arguments safely, preserving their types
 */
function serializeArgs(...args: unknown[]): string[] {
  return args.map((arg) => {
    // For primitives, convert to string representation
    if (arg === null) return 'null'
    if (arg === undefined) return 'undefined'
    if (typeof arg === 'string') return arg
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg)

    // For objects, arrays, etc., use safe stringify
    try {
      return safeStringify(arg)
    } catch {
      return String(arg)
    }
  })
}

/**
 * Lazily-resolved CLI ingest base URL. Read once on first log so it sees the
 * spawn-time `ADK_SPAN_INGEST_URL` env. `null` (resolved) means no ingest server
 * is configured, so telemetry falls back to the legacy stdout NDJSON stream.
 * Shared by the log exporter and the worker_stats endpoint route.
 */
let ingestUrl: string | null = null
let ingestUrlResolved = false
function getIngestUrl(): string | null {
  if (!ingestUrlResolved) {
    ingestUrlResolved = true
    ingestUrl = process.env.ADK_SPAN_INGEST_URL ?? null
  }
  return ingestUrl
}

/**
 * Lazily-resolved log exporter, built from the shared ingest URL.
 */
let logExporter: HttpLogExporter | null = null
let logExporterResolved = false
function getLogExporter(): HttpLogExporter | null {
  if (!logExporterResolved) {
    logExporterResolved = true
    const url = getIngestUrl()
    if (url) {
      logExporter = new HttpLogExporter(url)
    }
  }
  return logExporter
}

/**
 * Emit a structured log record. When the CLI ingest server is reachable
 * (`ADK_SPAN_INGEST_URL` explicitly set by a local CLI) records are shipped over HTTP
 * to /v1/logs — the log sibling of the span exporter. Otherwise they fall back to
 * the legacy stdout NDJSON stream so nothing is lost when there is no ingest server.
 */
function writeStructuredLog(type: LogLevel, ...args: unknown[]): void {
  const { spanId, traceId } = getTraceContext()

  let maybeArgObj = null
  try {
    maybeArgObj = typeof args[0] === 'string' ? JSON.parse(args[0]) : args[0]
  } catch {}

  if (maybeArgObj && typeof maybeArgObj === 'object' && maybeArgObj.type === 'worker_stats') {
    // worker_stats is a gauge snapshot (a metric), not a user log. It rides its own ingest
    // route — POST /v1/worker-stats — so the CLI keeps the latest value for the polled GET
    // endpoint without it ever polluting the log channel (no broadcast, no store, no file).
    // Its only consumer is the dev console's worker panel, served by that same ingest/backend
    // server; with no ingest URL there is no console to show it, so we drop it rather than emit
    // stdout noise nothing reads — unlike real logs below, which DO fall back to stdout.
    const url = getIngestUrl()
    if (url) {
      void postJsonToCli(url, '/v1/worker-stats', safeStringify(maybeArgObj.stats ?? maybeArgObj))
    }
    return
  }

  const logEntry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    type,
    args: serializeArgs(...args),
  }

  // Only include spanId/traceId if they exist
  if (spanId) {
    logEntry.spanId = spanId
  }
  if (traceId) {
    logEntry.traceId = traceId
  }

  // Also emit to an external OTLP collector when one is configured (no-op otherwise),
  // in addition to the CLI ingest / stdout path below — the log sibling of the span
  // OTLP export. Trace correlation is captured automatically from the active context.
  emitOtelLog(type, logEntry.args.join(' '))

  const exporter = getLogExporter()
  if (exporter) {
    exporter.export(logEntry)
  } else {
    process.stdout.write(safeStringify(logEntry) + LOG_DELIMITER)
  }
}

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
}

/**
 * Install structured logging - overrides console methods to output JSON
 */
export function installStructuredLogging(): void {
  // Override console.log
  console.log = (...args: unknown[]) => {
    writeStructuredLog('stdout', ...args)
  }

  // Override console.error
  console.error = (...args: unknown[]) => {
    writeStructuredLog('stderr', ...args)
  }

  // Override console.warn
  console.warn = (...args: unknown[]) => {
    writeStructuredLog('warn', ...args)
  }

  // Override console.info
  console.info = (...args: unknown[]) => {
    writeStructuredLog('info', ...args)
  }

  // Override console.debug (treat as stdout with lower importance)
  console.debug = (...args: unknown[]) => {
    writeStructuredLog('stdout', ...args)
  }
}

/**
 * Restore original console methods
 */
export function uninstallStructuredLogging(): void {
  console.log = originalConsole.log
  console.error = originalConsole.error
  console.warn = originalConsole.warn
  console.info = originalConsole.info
  console.debug = originalConsole.debug
}

/**
 * Direct access to original console methods
 */
export const originalConsoleLogger = originalConsole
