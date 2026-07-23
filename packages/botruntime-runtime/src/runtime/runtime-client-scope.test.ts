import { describe, expect, it } from 'vitest'
import {
  RUNTIME_ACTION_TIMEOUT_SAFETY_MARGIN_MS,
  runtimeActionTimeoutMs,
  runtimeClientCoordinates,
} from './runtime-client-scope'

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

  it('derives a clock-safe relative action budget with runtime cleanup margin', () => {
    expect(runtimeActionTimeoutMs(270_000)).toBe(
      270_000 - RUNTIME_ACTION_TIMEOUT_SAFETY_MARGIN_MS
    )
    expect(runtimeActionTimeoutMs(RUNTIME_ACTION_TIMEOUT_SAFETY_MARGIN_MS)).toBe(0)
    expect(runtimeActionTimeoutMs(RUNTIME_ACTION_TIMEOUT_SAFETY_MARGIN_MS - 1)).toBe(0)
    expect(runtimeActionTimeoutMs(Number.NaN)).toBe(0)
    expect(runtimeActionTimeoutMs(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
