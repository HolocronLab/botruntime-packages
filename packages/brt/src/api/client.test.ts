import { describe, expect, it } from 'vitest'
import * as consts from '../consts'
import type { Logger } from '../logger'
import { ApiClient } from './client'

describe('ApiClient', () => {
  it('uses the extended Botpress API timeout', () => {
    const api = new ApiClient(
      {
        apiUrl: 'https://api.example',
        token: 'private-token',
        workspaceId: 'workspace-id',
      },
      {} as Logger
    )

    expect(api.client.config.timeout).toBe(consts.defaultBotpressApiTimeout)
    expect(consts.defaultBotpressApiTimeout).toBe(180_000)
  })
})
