import { describe, expect, it } from 'vitest'
import { runtimeClientCoordinates } from './runtime-client-scope'

describe('runtime client workspace scope', () => {
  it('uses the numeric storage target for opaque development callbacks', () => {
    expect(
      runtimeClientCoordinates({
        BP_WORKSPACE_ID: '2',
        BP_TARGET_BOT_ID: '23',
      }, '04cc2591-b438-41b6-941c-46ae9f810eca'),
    ).toEqual({ botId: '23', workspaceId: '2' })
  })

  it('preserves production workspace coordinates when present', () => {
    expect(runtimeClientCoordinates({ NODE_ENV: 'production', BP_WORKSPACE_ID: '2' }, '23')).toEqual({
      botId: '23',
      workspaceId: '2',
    })
    expect(runtimeClientCoordinates({ NODE_ENV: 'production' }, '23')).toEqual({
      botId: '23',
      workspaceId: undefined,
    })
  })
})
