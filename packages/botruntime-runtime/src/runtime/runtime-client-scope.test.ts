import { describe, expect, it } from 'vitest'
import { runtimeClientWorkspaceId } from './runtime-client-scope'

describe('runtime client workspace scope', () => {
  it('explicitly suppresses workspace headers for opaque runtime callbacks even without NODE_ENV', () => {
    expect(
      runtimeClientWorkspaceId({
        BP_WORKSPACE_ID: '2',
        ADK_WORKSPACE_ID: '2',
      }, '04cc2591-b438-41b6-941c-46ae9f810eca'),
    ).toBe('')
  })

  it('preserves production workspace coordinates when present', () => {
    expect(runtimeClientWorkspaceId({ NODE_ENV: 'production', BP_WORKSPACE_ID: '2' }, '23')).toBe('2')
    expect(runtimeClientWorkspaceId({ NODE_ENV: 'production', ADK_WORKSPACE_ID: '3' }, '23')).toBe('3')
    expect(runtimeClientWorkspaceId({ NODE_ENV: 'production' }, '23')).toBeUndefined()
  })
})
