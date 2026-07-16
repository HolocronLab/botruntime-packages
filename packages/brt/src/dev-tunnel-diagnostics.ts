import type { TunnelRequest } from '@holocronlab/botruntime-tunnel'

const MAX_TUNNEL_FAILURE_BODY_CHARS = 2_048

export function isTunnelUnavailableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

export function formatTunnelFailure(request: TunnelRequest, status: number, body: unknown): string {
  const prefix = `Local tunnel handler failed: ${request.method} ${request.path} -> HTTP ${status} (requestId=${request.id})`
  if (body === undefined || body === null) return prefix
  const detail = String(body).trim()
  if (!detail) return prefix
  return `${prefix}: ${detail.slice(0, MAX_TUNNEL_FAILURE_BODY_CHARS)}`
}
