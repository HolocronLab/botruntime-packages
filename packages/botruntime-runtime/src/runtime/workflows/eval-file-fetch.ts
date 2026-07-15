import type { Client } from '@holocronlab/botruntime-client'

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const FORWARDED_HEADERS = new Set(['authorization', 'x-bot-id', 'x-workspace-id'])

/**
 * File URLs may be protected platform routes or externally signed storage
 * URLs. Forward runtime credentials only to the configured API origin.
 */
export function fetchEvalManifestFile(
  fileUrl: string,
  client: Pick<Client, 'config'>,
  fetchFn: Fetch = fetch,
): Promise<Response> {
  const apiUrl = new URL(client.config.apiUrl)
  const resolvedFileUrl = new URL(fileUrl, apiUrl)
  const headers: Record<string, string> = {}

  if (resolvedFileUrl.origin === apiUrl.origin) {
    for (const [name, value] of Object.entries(client.config.headers)) {
      const normalized = name.toLowerCase()
      if (FORWARDED_HEADERS.has(normalized) && typeof value === 'string') {
        headers[normalized] = value
      }
    }
  }

  return fetchFn(resolvedFileUrl, { headers })
}
