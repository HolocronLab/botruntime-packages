import { metrics } from '@opentelemetry/api'
import type { IntegrationLogger } from '@holocronlab/botruntime-sdk'
import type { DocConvertConfiguration } from './config'
import {
  DocConvertClient,
  type ConversionAudit,
  type ConvertToPdfInput,
  type ConvertToPdfOutput,
  type DocConvertClientOptions,
} from './docconvert-client'
import { normalizeDocConvertError, toRuntimeError } from './errors'

const meter = metrics.getMeter('@botruntime/integration-docconvert', '0.1.0')
const calls = meter.createCounter('docconvert.calls', { description: 'DOCX conversion action outcomes' })
const duration = meter.createHistogram('docconvert.duration', {
  description: 'DOCX conversion action duration',
  unit: 'ms',
})

export async function convertToPdf(
  configuration: Partial<DocConvertConfiguration>,
  input: ConvertToPdfInput,
  logger: IntegrationLogger,
  options: DocConvertClientOptions = {},
): Promise<ConvertToPdfOutput> {
  const startedAt = Date.now()
  const audit: ConversionAudit = {
    sourceSha256: typeof input.sha256 === 'string' ? input.sha256.toLowerCase() : undefined,
  }
  try {
    const result = await new DocConvertClient(configuration, options).convert(input, audit)
    recordOutcome(logger, 'ok', startedAt, audit)
    return result
  } catch (caught) {
    const error = normalizeDocConvertError(caught)
    recordOutcome(logger, error.code, startedAt, audit)
    throw toRuntimeError(error)
  }
}

function recordOutcome(
  logger: IntegrationLogger,
  result: string,
  startedAt: number,
  audit: ConversionAudit,
): void {
  const durationMs = Math.max(0, Date.now() - startedAt)
  calls.add(1, { result })
  duration.record(durationMs, { result })
  const line = JSON.stringify({
    event: 'docconvert.convert',
    result,
    sourceSha256: audit.sourceSha256,
    inputBytes: audit.inputBytes,
    outputBytes: audit.outputBytes,
    pageCount: audit.pageCount,
    durationMs,
    engine: audit.engine,
  })
  if (result === 'ok') logger.info(line)
  else logger.warn(line)
}
