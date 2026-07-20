import { describe, expect, it } from 'vitest'
import { formatTunnelFailure, isTunnelUnavailableStatus } from './dev-tunnel-diagnostics'

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req_123',
    method: 'PUT',
    path: '/v1/chat/workflows/wkflow_1',
    query: '',
    headers: {},
    body: '',
    ...overrides,
  } as any
}

describe('dev tunnel diagnostics', () => {
  it.each([502, 503, 504])('treats HTTP %s as an unavailable tunnel', (status) => {
    expect(isTunnelUnavailableStatus(status)).toBe(true)
  })

  it.each([400, 401, 404, 409, 500])('does not misclassify local HTTP %s as unavailable', (status) => {
    expect(isTunnelUnavailableStatus(status)).toBe(false)
  })

  it.each([undefined, null, '503'])('does not classify a non-numeric status %s as unavailable', (status) => {
    expect(isTunnelUnavailableStatus(status)).toBe(false)
  })

  it('reports the local method, path, status, request ID, and response', () => {
    const diagnostic = formatTunnelFailure(request(), 500, '{"id":"err_123","message":"update workflow failed"}')

    expect(diagnostic).toContain('PUT /v1/chat/workflows/wkflow_1')
    expect(diagnostic).toContain('HTTP 500')
    expect(diagnostic).toContain('requestId=req_123')
    expect(diagnostic).toContain('err_123')
    expect(diagnostic).toContain('update workflow failed')
  })

  it('bounds an untrusted local response body', () => {
    const diagnostic = formatTunnelFailure(request({ method: 'GET', path: '/health', id: 'req_1' }), 502, 'x'.repeat(4_096))

    expect(diagnostic).toBe(
      `Local tunnel handler failed: GET /health -> HTTP 502 (requestId=req_1): ${'x'.repeat(2_048)}`
    )
  })
})
