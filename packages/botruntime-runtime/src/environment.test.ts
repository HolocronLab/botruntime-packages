import { describe, expect, test } from 'vitest'
import { resolveEnvironment } from './environment'

describe('resolveEnvironment', () => {
  test('treats a Bun dev worker as development', () => {
    expect(
      resolveEnvironment(
        {
          NODE_ENV: 'development',
          ADK_RUNTIME_MODE: 'development',
          ADK_DIRECTORY: '/agent',
          AGENT_DIRECTORY: '/agent',
          ADK_LOCAL_PAT: 'pat',
        },
        true
      )
    ).toEqual({
      type: 'development',
      adk: { directory: '/agent' },
      agent: { directory: '/agent' },
      local: { PAT: 'pat' },
    })
  })

  test('keeps a Bun CLI process in command mode', () => {
    expect(resolveEnvironment({ NODE_ENV: 'development' }, true)).toEqual({
      type: 'command',
      command: 'adk-dev',
    })
  })

  test('production Lambda takes precedence over worker markers', () => {
    expect(
      resolveEnvironment(
        {
          AWS_LAMBDA_FUNCTION_NAME: 'botruntime',
          NODE_ENV: 'development',
          ADK_RUNTIME_MODE: 'development',
        },
        true
      )
    ).toEqual({ type: 'production' })
  })
})
