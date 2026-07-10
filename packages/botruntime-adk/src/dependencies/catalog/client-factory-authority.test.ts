import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({ constructorOptions: [] as Array<Record<string, unknown>> }))

vi.mock('@holocronlab/botruntime-client', () => ({
  Client: class Client {
    constructor(options: Record<string, unknown>) {
      clientMocks.constructorOptions.push(options)
    }
  },
}))

import { clearProjectClientCache } from '../../auth/index.js'
import { CatalogClientFactory } from './client-factory.js'

describe('CatalogClientFactory cache authority', () => {
  beforeEach(() => {
    clientMocks.constructorOptions.length = 0
    clearProjectClientCache()
  })

  it('uses the same provided-credentials coordinates for network and cache authority', async () => {
    const factory = new CatalogClientFactory({
      project: {
        agentInfo: {
          botId: 'project_bot',
          apiUrl: 'https://project-stack.example/',
          workspaceId: 'project_workspace',
        },
      },
      credentials: {
        token: 'profile_token',
        apiUrl: 'https://profile-stack.example',
        workspaceId: 'profile_workspace',
      },
    })

    expect(factory.cacheAuthority).toEqual({
      apiUrl: 'https://profile-stack.example',
      workspaceId: 'profile_workspace',
    })
    await factory.getClient()
    expect(clientMocks.constructorOptions).toEqual([
      expect.objectContaining({
        token: 'profile_token',
        apiUrl: 'https://profile-stack.example',
        workspaceId: 'profile_workspace',
      }),
    ])
  })

  it('rejects explicit coordinates that disagree with provided credentials before cache or client access', () => {
    expect(
      () =>
        new CatalogClientFactory({
          credentials: {
            token: 'target_token',
            apiUrl: 'https://profile-stack.example',
            workspaceId: 'profile_workspace',
          },
          apiUrl: 'https://explicit-stack.example/',
          workspaceId: 'explicit_workspace',
        })
    ).toThrow(/match|authority/i)
    expect(clientMocks.constructorOptions).toEqual([])
  })

  it('accepts matching explicit coordinates and keeps the same cache/network authority', async () => {
    const factory = new CatalogClientFactory({
      credentials: {
        token: 'target_token',
        apiUrl: 'https://profile-stack.example',
        workspaceId: 'profile_workspace',
      },
      apiUrl: 'https://profile-stack.example/',
      workspaceId: 'profile_workspace',
    })

    expect(factory.cacheAuthority).toEqual({
      apiUrl: 'https://profile-stack.example',
      workspaceId: 'profile_workspace',
    })
    await factory.getClient()
    expect(clientMocks.constructorOptions).toEqual([
      expect.objectContaining({
        token: 'target_token',
        apiUrl: 'https://profile-stack.example',
        workspaceId: 'profile_workspace',
      }),
    ])
  })
})
