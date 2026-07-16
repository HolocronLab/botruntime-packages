import { describe, expect, test } from 'bun:test'
import { getStoredBotToken } from '../src/botToken'
import type { Client } from '../src/misc/types'

const clientWithGetState = (getState: Client['getState']): Client =>
  ({ getState }) as Client

describe('getStoredBotToken', () => {
  test('uses the Botruntime installation config without calling legacy credentials-state', async () => {
    let stateCalls = 0
    const client = clientWithGetState(async () => {
      stateCalls += 1
      throw new Error('state API must not be load-bearing')
    })

    await expect(getStoredBotToken(client, 'telegram-installation', 'config-token')).resolves.toBe('config-token')
    expect(stateCalls).toBe(0)
  })

  test('keeps credentials-state as a legacy fallback when config is absent', async () => {
    const client = clientWithGetState(async () => ({ state: { payload: { botToken: 'legacy-token' } } }))

    await expect(getStoredBotToken(client, 'telegram-installation')).resolves.toBe('legacy-token')
  })

  test('reports an unexpected legacy state failure when no config token exists', async () => {
    const client = clientWithGetState(async () => {
      throw new Error('upstream unavailable')
    })

    await expect(getStoredBotToken(client, 'telegram-installation')).rejects.toThrow(
      /Fail to get stored bot token: upstream unavailable/,
    )
  })
})
