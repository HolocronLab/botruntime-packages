/**
 * External OTLP logs export — the log sibling of tracing.ts's OTLP span export.
 *
 * When `OTEL_EXPORTER_OTLP_ENDPOINT` is set (dev only, e.g. an otel-collector / otel-tui),
 * structured console logs are also emitted as OpenTelemetry LogRecords and shipped to that
 * collector via the OTLP/HTTP logs exporter — in addition to the CLI ingest channel
 * (HttpLogExporter → /v1/logs). Mirrors how tracing.ts adds an OTLPTraceExporter alongside
 * the CLI's HttpSpanExporter. With no endpoint configured this module is inert: `emitOtelLog`
 * is a zero-cost no-op.
 *
 * Trace correlation is automatic — the SDK's Logger.emit captures the active span context, so
 * each log record is linked to the span it was written under.
 */

import { logs, SeverityNumber, type LogAttributes } from '@opentelemetry/api-logs'
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { Environment, getEnvironmentInfo } from '../environment'

type LogType = 'stdout' | 'stderr' | 'warn' | 'info'

let loggerProvider: LoggerProvider | null = null

if (Environment.isDevelopment()) {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (otlpEndpoint) {
    const base = otlpEndpoint.replace(/\/+$/, '').replace(/\/v1\/logs$/, '')
    const exporter = new OTLPLogExporter({ url: `${base}/v1/logs` })

    const environmentInfo = getEnvironmentInfo()
    const botName = process.env.ADK_BOT_NAME
    const resource = resourceFromAttributes({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spreading environment info into resource attributes
      ...(environmentInfo as any),
      'service.name': botName ? `bp_bot_${botName}` : 'bp_bot_unknown',
    })

    loggerProvider = new LoggerProvider({
      resource,
      processors: [new BatchLogRecordProcessor(exporter)],
    })
    logs.setGlobalLoggerProvider(loggerProvider)
  }
}

// Bound after setGlobalLoggerProvider so it resolves to our provider; a no-op logger
// when no provider was configured.
const otelLogger = logs.getLogger('brt', '1.0.0')

function toSeverity(type: LogType): { number: SeverityNumber; text: string } {
  switch (type) {
    case 'stderr':
      return { number: SeverityNumber.ERROR, text: 'ERROR' }
    case 'warn':
      return { number: SeverityNumber.WARN, text: 'WARN' }
    case 'info':
    case 'stdout':
    default:
      return { number: SeverityNumber.INFO, text: 'INFO' }
  }
}

/**
 * Emit a structured log to the external OTLP collector. No-op unless an OTLP endpoint
 * is configured. Never throws — telemetry must not break the bot.
 */
export function emitOtelLog(type: LogType, body: string, attributes?: LogAttributes): void {
  if (!loggerProvider) return
  try {
    const severity = toSeverity(type)
    otelLogger.emit({
      severityNumber: severity.number,
      severityText: severity.text,
      body,
      ...(attributes ? { attributes } : {}),
    })
  } catch {
    // Silent — never let logging break the bot.
  }
}

/** Flush + shut down the OTLP logs pipeline on process exit. No-op when unconfigured. */
export async function shutdownLogging(): Promise<void> {
  if (!loggerProvider) return
  await loggerProvider.forceFlush().catch(() => {})
  await loggerProvider.shutdown().catch(() => {})
}
