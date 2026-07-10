/**
 * HttpLogExporter — ships structured console logs to the CLI over HTTP.
 *
 * The log sibling of `HttpSpanExporter`: both POST to the CLI's in-process ingest
 * server (spans → /v1/traces, logs → /v1/logs) and share the fire-and-forget
 * `postJsonToCli` transport so they never block the runtime.
 */

import { postJsonToCli } from './cli-transport'

/**
 * Wire shape of a single structured log record. Mirrored CLI-side by the ingest
 * receiver / broadcaster; keep the two in sync.
 */
export interface StructuredLogEntry {
  timestamp: string
  type: 'stdout' | 'stderr' | 'warn' | 'info'
  args: string[]
  spanId?: string
  traceId?: string
}

export class HttpLogExporter {
  private cliUrl: string

  constructor(cliUrl: string) {
    this.cliUrl = cliUrl.replace(/\/$/, '')
  }

  export(entry: StructuredLogEntry): void {
    try {
      void postJsonToCli(this.cliUrl, '/v1/logs', JSON.stringify(entry))
    } catch {
      // Silent — never let logging break the bot.
    }
  }
}
