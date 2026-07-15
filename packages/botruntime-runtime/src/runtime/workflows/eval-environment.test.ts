import { describe, expect, it } from 'vitest'
import { resolveEvalExecutionEnvironment } from './eval-environment'

describe('eval runtime environment', () => {
  it('uses a production runtime api_key without human target/workspace authority', () => {
    expect(
      resolveEvalExecutionEnvironment(
        {
          NODE_ENV: 'production',
          BP_API_URL: 'https://api.example/',
          BP_TOKEN: 'runtime-api-key',
          BP_TARGET_BOT_ID: '42-must-be-ignored',
        },
        'runtime_prod',
      ),
    ).toEqual({
      apiUrl: 'https://api.example',
      token: 'runtime-api-key',
      runtimeBotId: 'runtime_prod',
      apiBotId: 'runtime_prod',
      development: false,
    })
  })

  it('separates attested development routing from the numeric API target', () => {
    expect(
      resolveEvalExecutionEnvironment(
        {
          NODE_ENV: 'development',
          BP_API_URL: 'https://api.example',
          BP_TOKEN: 'human-pat',
          BP_WORKSPACE_ID: '9001',
          BP_TARGET_BOT_ID: '42',
        },
        'dev_opaque_runtime',
      ),
    ).toEqual({
      apiUrl: 'https://api.example',
      token: 'human-pat',
      runtimeBotId: 'dev_opaque_runtime',
      apiBotId: '42',
      workspaceId: '9001',
      development: true,
    })
  })

  it('supports BP-first ADK-compatible runtime coordinates', () => {
    expect(
      resolveEvalExecutionEnvironment(
        {
          NODE_ENV: 'production',
          BP_API_URL: 'https://bp.example',
          ADK_API_URL: 'https://adk.example',
          BP_TOKEN: 'bp-token',
          ADK_TOKEN: 'adk-token',
        },
        'runtime_bot',
      ),
    ).toMatchObject({ apiUrl: 'https://bp.example', token: 'bp-token' })

    expect(
      resolveEvalExecutionEnvironment(
        {
          NODE_ENV: 'development',
          ADK_API_URL: 'https://adk.example/',
          ADK_TOKEN: 'adk-token',
          ADK_WORKSPACE_ID: 'legacy-workspace',
          ADK_TARGET_BOT_ID: '73',
        },
        'dev_adk_runtime',
      ),
    ).toEqual({
      apiUrl: 'https://adk.example',
      token: 'adk-token',
      runtimeBotId: 'dev_adk_runtime',
      apiBotId: '73',
      workspaceId: 'legacy-workspace',
      development: true,
    })
  })

  it('fails closed on missing runtime credentials or identity', () => {
    const base = {
      NODE_ENV: 'production',
      BP_API_URL: 'https://api.example',
      BP_TOKEN: 'runtime-token',
    }
    expect(() =>
      resolveEvalExecutionEnvironment(
        { ...base, BP_API_URL: undefined },
        'runtime_bot',
      ),
    ).toThrow(/API_URL/i)
    expect(() =>
      resolveEvalExecutionEnvironment(
        { ...base, BP_TOKEN: undefined },
        'runtime_bot',
      ),
    ).toThrow(/token/i)
    expect(() => resolveEvalExecutionEnvironment(base, '')).toThrow(
      /runtime bot/i,
    )
    expect(() =>
      resolveEvalExecutionEnvironment(
        { ...base, NODE_ENV: 'development' },
        'dev_runtime',
      ),
    ).toThrow(/target bot/i)
  })
})
