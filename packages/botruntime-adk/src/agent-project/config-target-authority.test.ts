import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Authority = {
  token: string
  apiUrl: string
  workspaceId: string
}

const authMocks = vi.hoisted(() => ({
  catalogCalls: [] as Array<Authority & { operation: string; botId?: string }>,
  getProjectClient: vi.fn(),
}))

vi.mock('../auth/index.js', () => ({
  getProjectClient: authMocks.getProjectClient,
  resolveWorkspaceCredentials: vi.fn(),
  assertCompleteCredentials: (credentials: Authority) => credentials,
}))
vi.mock('../dependencies/catalog/resolution-cache.js', () => ({
  ResolutionCache: class ResolutionCache {
    async getResolution() {
      return null
    }
    async getDefinition() {
      return null
    }
    async setResolution() {}
    async setDefinition() {}
    async getStats() {
      return {
        resolutions: { count: 0, sizeBytes: 0 },
        definitions: { count: 0, sizeBytes: 0 },
      }
    }
    async clear() {}
  },
}))
vi.mock('@holocronlab/botruntime-runtime', () => ({
  Autonomous: { Tool: class Tool {} },
  defineConfig: <T>(config: T) => config,
}))
vi.mock('@holocronlab/botruntime-runtime/internal', () => ({
  BuiltInActions: {},
  BuiltInWorkflows: {},
  Errors: {},
  Primitives: { Definitions: {} },
  Workflow: {},
  isAgentConfig: () => true,
  setAdkCommand: vi.fn(),
}))
vi.mock('@holocronlab/botruntime-runtime/definition', () => ({
  BUILT_IN_TAGS: { workflow: {}, user: {}, message: {}, conversation: {} },
}))
vi.mock('../bot-generator/integration-sync.js', () => ({ IntegrationSync: class IntegrationSync {} }))
vi.mock('../bot-generator/interface-sync.js', () => ({ InterfaceSync: class InterfaceSync {} }))
vi.mock('../bot-generator/plugin-sync.js', () => ({ PluginSync: class PluginSync {} }))
vi.mock('../bot-generator/dev-id-manager.js', () => ({ DevIdManager: class DevIdManager {} }))
vi.mock('../utils/link-sdk.js', () => ({ linkSdk: vi.fn() }))

import { AgentProject } from './agent-project.js'
import { BotGenerator } from '../bot-generator/generator.js'
import type { ServerConfigTarget } from '../integrations/config-utils.js'

const POISON = {
  botId: 'poison_bot',
  workspaceId: 'poison_workspace',
  apiUrl: 'http://agent-local-poison.invalid',
}

const makeIntegration = (name: string, version: string) => ({
  id: `${name}_${version}`,
  name,
  version,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  actions: {},
  channels: {},
  events: {},
  entities: {},
  interfaces: {},
  configurations: {},
  user: { tags: {} },
})

const makeInterface = (name: string, version: string) => ({
  id: `${name}_${version}`,
  name,
  version,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  actions: {},
  entities: {},
})

function writeDependencySnapshot(projectPath: string, target: ServerConfigTarget & { botId: string }): void {
  const snapshotDir = path.join(projectPath, '.adk', 'dependencies')
  fs.mkdirSync(snapshotDir, { recursive: true })
  fs.writeFileSync(
    path.join(snapshotDir, `${target.environment}.json`),
    JSON.stringify({
      version: 2,
      env: target.environment,
      target: {
        apiUrl: target.credentials.apiUrl.replace(/\/+$/, ''),
        workspaceId: target.credentials.workspaceId,
        botId: target.botId,
      },
      fetchedAt: '2026-07-10T00:00:00.000Z',
      integrations: {
        telegram: { name: 'telegram', version: '1.0.0', enabled: true },
      },
      plugins: {},
    })
  )
}

function resolvedAuthority(options: Record<string, any>): Authority {
  const projectInfo = options.project?.agentInfo ?? (options.project?.path ? POISON : undefined)
  return {
    token: options.credentials?.token ?? 'ambient_token',
    apiUrl: options.apiUrl ?? projectInfo?.apiUrl ?? 'https://ambient.example',
    workspaceId: options.workspaceId ?? projectInfo?.workspaceId ?? 'ambient_workspace',
  }
}

describe('AgentProject config target credential authority', () => {
  let projectPath: string

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-config-target-authority-'))
    fs.mkdirSync(path.join(projectPath, 'src'))
    fs.writeFileSync(path.join(projectPath, 'agent.config.ts'), 'export default { name: "authority-fixture" }')
    fs.writeFileSync(
      path.join(projectPath, 'agent.json'),
      JSON.stringify({ botId: 'prod_bot', workspaceId: 'prod_workspace', apiUrl: 'https://prod.example' })
    )
    fs.writeFileSync(path.join(projectPath, 'agent.local.json'), JSON.stringify(POISON))

    writeDependencySnapshot(projectPath, {
      environment: 'prod',
      botId: 'prod_bot',
      credentials: { token: 'prod_pat', apiUrl: 'https://prod.example', workspaceId: 'prod_workspace' },
    })

    authMocks.catalogCalls.length = 0
    authMocks.getProjectClient.mockImplementation(async (options: Record<string, any>) => {
      const authority = resolvedAuthority(options)
      const record = (operation: string) =>
        authMocks.catalogCalls.push({
          ...authority,
          operation,
          ...(options.botId ? { botId: options.botId } : {}),
        })
      return {
        getIntegrationByName: async ({ name, version }: { name: string; version: string }) => {
          record('getIntegrationByName')
          return { integration: makeIntegration(name, version) }
        },
        getPublicIntegration: async ({ name, version }: { name: string; version: string }) => {
          record('getPublicIntegration')
          return { integration: makeIntegration(name, version) }
        },
        getInterfaceByName: async ({ name, version }: { name: string; version: string }) => {
          record('getInterfaceByName')
          return { interface: makeInterface(name, version) }
        },
        getPublicInterface: async ({ name, version }: { name: string; version: string }) => {
          record('getPublicInterface')
          return { interface: makeInterface(name, version) }
        },
        listFiles: async () => {
          record('listFiles')
          return { files: [] }
        },
      }
    })
    AgentProject.clearCache()
  })

  afterEach(() => {
    AgentProject.clearCache()
    vi.clearAllMocks()
    fs.rmSync(projectPath, { recursive: true, force: true })
  })

  it.each([
    {
      label: 'prod generation',
      adkCommand: 'adk-build' as const,
      target: {
        environment: 'prod' as const,
        botId: 'prod_bot',
        credentials: { token: 'prod_pat', apiUrl: 'https://prod.example', workspaceId: 'prod_workspace' },
      },
    },
    {
      label: 'nonlocal dev generation',
      adkCommand: 'adk-dev' as const,
      target: {
        environment: 'dev' as const,
        botId: '42',
        runtimeBotId: 'dev_runtime',
        credentials: { token: 'dev_pat', apiUrl: 'https://dev.example', workspaceId: 'dev_workspace' },
      },
    },
    {
      label: 'local dev generation',
      adkCommand: 'adk-dev' as const,
      target: {
        environment: 'dev' as const,
        botId: '42',
        runtimeBotId: 'dev_runtime',
        credentials: { token: 'local_pat', apiUrl: 'http://selected-local.example', workspaceId: 'local_workspace' },
      },
    },
  ])('pins every actual catalog call to the caller-selected authority for $label', async ({ adkCommand, target }) => {
    writeDependencySnapshot(projectPath, target)
    const generator = new BotGenerator({
      projectPath,
      outputPath: path.join(projectPath, '.adk', 'bot'),
      adkCommand,
      configTarget: target,
    })

    await (generator as unknown as { generateIntegrationsTypes(): Promise<void> }).generateIntegrationsTypes()

    expect(authMocks.catalogCalls.length).toBeGreaterThan(0)
    expect(authMocks.catalogCalls).toEqual(
      authMocks.catalogCalls.map((call) => ({
        ...target.credentials,
        operation: call.operation,
      }))
    )
    expect(JSON.stringify(authMocks.catalogCalls)).not.toContain(POISON.apiUrl)
    expect(JSON.stringify(authMocks.catalogCalls)).not.toContain(POISON.workspaceId)
  })

  it('does not reuse a project loaded under different target-affecting credentials', async () => {
    const firstTarget: ServerConfigTarget = {
      environment: 'prod',
      botId: 'prod_bot',
      credentials: { token: 'first_pat', apiUrl: 'https://first.example', workspaceId: 'first_workspace' },
    }
    const secondTarget: ServerConfigTarget = {
      environment: 'prod',
      botId: 'other_prod_bot',
      credentials: { token: 'second_pat', apiUrl: 'https://second.example', workspaceId: 'second_workspace' },
    }

    writeDependencySnapshot(projectPath, firstTarget)
    const first = await AgentProject.load(projectPath, {
      adkCommand: 'adk-build',
      configTarget: firstTarget,
    })
    writeDependencySnapshot(projectPath, secondTarget)
    const second = await AgentProject.load(projectPath, {
      adkCommand: 'adk-build',
      configTarget: secondTarget,
    })

    expect(second).not.toBe(first)
    expect(authMocks.catalogCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining(firstTarget.credentials),
        expect.objectContaining(secondTarget.credentials),
      ])
    )
  })

  it('bypasses static cache for credentialed targets and binds a rotated token to fresh catalog clients', async () => {
    const authority = {
      environment: 'prod' as const,
      botId: 'prod_bot',
      credentials: { token: 'first_pat', apiUrl: 'https://prod.example', workspaceId: 'prod_workspace' },
    }
    const first = await AgentProject.load(projectPath, {
      adkCommand: 'adk-build',
      configTarget: authority,
    })
    authMocks.catalogCalls.length = 0
    const rotated = await AgentProject.load(projectPath, {
      adkCommand: 'adk-build',
      configTarget: {
        ...authority,
        credentials: { ...authority.credentials, token: 'rotated_pat' },
      },
    })

    expect(rotated).not.toBe(first)
    expect(authMocks.catalogCalls.length).toBeGreaterThan(0)
    expect(authMocks.catalogCalls.every((call) => call.token === 'rotated_pat')).toBe(true)

    const cacheKey = (AgentProject as any)._getCacheKey(path.resolve(projectPath), {
      adkCommand: 'adk-build',
      configTarget: authority,
    })
    expect(cacheKey).not.toContain('first_pat')
    expect(cacheKey).not.toMatch(/[a-f0-9]{64}/)
  })

  it('pins the AgentProject asset surface to prod before any remote asset read', async () => {
    const target: ServerConfigTarget = {
      environment: 'prod',
      botId: 'prod_bot',
      credentials: { token: 'prod_pat', apiUrl: 'https://prod.example', workspaceId: 'prod_workspace' },
    }
    const project = await AgentProject.load(projectPath, {
      adkCommand: 'adk-build',
      configTarget: target,
      noCache: true,
    })
    expect(project.agentInfo).toEqual({
      botId: target.botId,
      workspaceId: target.credentials.workspaceId,
      apiUrl: target.credentials.apiUrl,
    })
    authMocks.catalogCalls.length = 0

    await project.assetsManager.createSyncPlan()

    expect(authMocks.catalogCalls).toEqual([
      {
        ...target.credentials,
        botId: target.botId,
        operation: 'listFiles',
      },
    ])
    expect(JSON.stringify(authMocks.catalogCalls)).not.toContain(POISON.apiUrl)
    expect(JSON.stringify(authMocks.catalogCalls)).not.toContain(POISON.workspaceId)
  })

  it('rejects an explicit credential-less target before any ambient catalog call', async () => {
    await expect(
      AgentProject.load(projectPath, {
        adkCommand: 'adk-dev',
        configTarget: { environment: 'dev' },
        noCache: true,
      })
    ).rejects.toThrow(/credentials|authority|token/i)

    expect(authMocks.catalogCalls).toEqual([])
  })
})
