import { describe, expect, it } from 'vitest'
import { runtimeClientWorkspaceId } from './runtime-client-scope'

describe('runtime client workspace scope', () => {
  it('explicitly suppresses workspace headers for development callbacks', () => {
    expect(
      runtimeClientWorkspaceId({
        NODE_ENV: 'development',
        BP_WORKSPACE_ID: '2',
        ADK_WORKSPACE_ID: '2',
      }),
    ).toBe('')
  })

  it('preserves production workspace coordinates when present', () => {
    expect(runtimeClientWorkspaceId({ NODE_ENV: 'production', BP_WORKSPACE_ID: '2' })).toBe('2')
    expect(runtimeClientWorkspaceId({ NODE_ENV: 'production', ADK_WORKSPACE_ID: '3' })).toBe('3')
    expect(runtimeClientWorkspaceId({ NODE_ENV: 'production' })).toBeUndefined()
  })
})
