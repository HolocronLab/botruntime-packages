/**
 * Shared transport for the runtime's telemetry exporters (spans + logs).
 *
 * Both `HttpSpanExporter` and `HttpLogExporter` ship data to the CLI's in-process
 * ingest server over HTTP. This module owns the one piece they
 * share: a `fetch` that runs with HTTP instrumentation suppressed, so exporting
 * telemetry never recursively instruments its own request.
 */

import { AsyncLocalStorage } from 'async_hooks'
import { getSingleton } from '../runtime/singletons'

// Access the same silent-tracing flag used by instrument-http.ts via the globalThis
// singleton directly. Going through the singleton (rather than importing tracing.ts)
// avoids the circular dependency tracing.ts → exporter → tracing.ts.
const silentTracingFlag = getSingleton('__ADK_GLOBAL_SILENT_TRACING', () => new AsyncLocalStorage<boolean>())

/** Run fetch with tracing suppressed so the HTTP instrumentation ignores it. */
export function silentFetch(url: string, init: RequestInit): Promise<void> {
  return silentTracingFlag.run(true, async () => {
    await fetch(url, init).then(() => undefined, () => undefined)
  })
}

/** POST a JSON body to a path on the CLI ingest server. Callers may track it. */
export function postJsonToCli(baseUrl: string, path: string, body: string, signal?: AbortSignal): Promise<void> {
  return silentFetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  })
}
