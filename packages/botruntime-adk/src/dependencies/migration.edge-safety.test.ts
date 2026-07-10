import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@holocronlab/botruntime-runtime', () => ({ extractMissingRequiredFields: vi.fn(() => []) }))

import { DependencyMigrationManager } from './migration.js'

const TARGET = {
  env: 'prod' as const,
  apiUrl: 'https://authority.example',
  workspaceId: 'workspace_exact',
  botId: 'bot_prod',
}

type IntegrationEntry = {
  name: string
  version: string
  enabled: boolean
  config: Record<string, unknown>
}

const digest = (value: string): string =>
  `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`

const cloudIntegration = (entry: IntegrationEntry): Record<string, unknown> => ({
  id: `integration_${entry.name}`,
  installationId: `installation_${entry.name}`,
  name: entry.name,
  version: entry.version,
  enabled: entry.enabled,
  configuration: entry.config,
  configurationType: 'manual',
  configurationRevision: digest(JSON.stringify(entry.config)),
  status: 'registered',
  statusReason: '',
})

const cloudBot = (options: {
  integrations?: Record<string, Record<string, unknown>>
  plugins?: Record<string, Record<string, unknown>>
}) => ({
  bot: {
    id: TARGET.botId,
    updatedAt: '2026-07-10T00:00:00.000Z',
    dev: false,
    tags: {},
    integrations: options.integrations ?? {},
    plugins: options.plugins ?? {},
    devReadiness: {
      schemaVersion: 1,
      integrations: { authority: 'authoritative', source: 'integration_installation' },
      plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
      lastDevDeployment: { authority: 'unknown', reason: 'not_required_by_migration_test' },
    },
  },
})

describe('dependency migration adversarial edge safety', () => {
  let projectPath: string

  const configPath = () => path.join(projectPath, 'agent.config.ts')
  const lockPath = () => path.join(projectPath, 'dependencies.prod.lock.json')
  const pendingPath = () =>
    path.join(projectPath, '.adk', 'dependencies', 'migration.prod.pending.json')
  const markerPath = () => path.join(projectPath, '.adk', 'dependencies', 'migration.json')
  const snapshotPath = () => path.join(projectPath, '.adk', 'dependencies', 'prod.json')

  const writeRaw = (filePath: string, raw: string): string => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, raw)
    return raw
  }

  const makeManager = (options: {
    getBot: ReturnType<typeof vi.fn>
    integrationApply?: ReturnType<typeof vi.fn>
    pluginApply?: ReturnType<typeof vi.fn>
  }): DependencyMigrationManager =>
    new DependencyMigrationManager({
      projectPath,
      client: { getBot: options.getBot } as any,
      target: TARGET,
      integrationResolver: { applyToCloud: options.integrationApply ?? vi.fn() },
      pluginResolver: { applyToCloud: options.pluginApply ?? vi.fn() },
    })

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-migration-edge-safety-'))
    writeRaw(
      path.join(projectPath, 'agent.json'),
      `${JSON.stringify({
        botId: TARGET.botId,
        apiUrl: TARGET.apiUrl,
        workspaceId: TARGET.workspaceId,
      })}\n`
    )
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('does not select an arbitrary earlier defineConfig when the default export dependencies are dynamic', async () => {
    const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

const dummy = defineConfig({ dependencies: { integrations: { decoy: 'decoy@1.0.0' } } })
const actualDependencies = { integrations: { actual: 'actual@1.0.0' } }

export default defineConfig({ dependencies: actualDependencies })
void dummy
`
    writeRaw(configPath(), configRaw)
    const getBot = vi.fn(async () => cloudBot({}))
    const integrationApply = vi.fn()

    await expect(makeManager({ getBot, integrationApply }).run()).rejects.toThrow(
      /agent\.config.*dependencies.*(literal|dynamic|default export|ambiguous)/i
    )

    expect(getBot).not.toHaveBeenCalled()
    expect(integrationApply).not.toHaveBeenCalled()
    expect(fs.readFileSync(configPath(), 'utf8')).toBe(configRaw)
    expect(fs.existsSync(pendingPath())).toBe(false)
  })

  it('rejects TypeScript syntax diagnostics anywhere in agent.config before Cloud access', async () => {
    const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({ dependencies: { integrations: { chat: 'chat@1.0.0' } } })
const malformedTail = {
`
    writeRaw(configPath(), configRaw)
    const getBot = vi.fn(async () => cloudBot({}))
    const integrationApply = vi.fn()

    await expect(makeManager({ getBot, integrationApply }).run()).rejects.toThrow(
      /agent\.config.*(syntax|parse|diagnostic|expected)/i
    )

    expect(getBot).not.toHaveBeenCalled()
    expect(integrationApply).not.toHaveBeenCalled()
    expect(fs.readFileSync(configPath(), 'utf8')).toBe(configRaw)
    expect(fs.existsSync(pendingPath())).toBe(false)
  })

  it('rejects a shadowed defineConfig instead of trusting the callee text', async () => {
    const configRaw = `import { defineConfig as runtimeDefineConfig } from '@holocronlab/botruntime-runtime'

const defineConfig = (value: unknown) => value
export default defineConfig({ dependencies: { integrations: { decoy: 'decoy@1.0.0' } } })
void runtimeDefineConfig
`
    writeRaw(configPath(), configRaw)
    const getBot = vi.fn(async () => cloudBot({}))
    const integrationApply = vi.fn()

    await expect(makeManager({ getBot, integrationApply }).run()).rejects.toThrow(
      /agent\.config.*defineConfig.*(import|binding|runtime|shadow)/i
    )

    expect(getBot).not.toHaveBeenCalled()
    expect(integrationApply).not.toHaveBeenCalled()
    expect(fs.readFileSync(configPath(), 'utf8')).toBe(configRaw)
    expect(fs.existsSync(pendingPath())).toBe(false)
  })

  it.each(['@holocronlab/botruntime-runtime', '@botpress/runtime'])(
    'accepts an aliased named defineConfig import from %s',
    async (moduleName) => {
      writeRaw(
        configPath(),
        `import { defineConfig as makeAgentConfig } from '${moduleName}'

export default makeAgentConfig({ dependencies: {} })
`
      )
      const getBot = vi.fn(async () => cloudBot({}))

      await makeManager({ getBot }).run()

      expect(getBot).toHaveBeenCalledTimes(1)
      expect(fs.existsSync(snapshotPath())).toBe(true)
    }
  )

  it('uses JavaScript property and numeric literal semantics in the immutable plan', async () => {
    const configRaw = String.raw`import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  dependencies: {
    integrations: {
      'a\u0062': {
        version: 'chat@1.0.0',
        enabled: false,
        config: { positive: 1_000, negative: -1_000 },
      },
      0x10: 'hex-chat@2.0.0',
    },
  },
})
`
    writeRaw(configPath(), configRaw)
    const installed: Record<string, Record<string, unknown>> = Object.create(null)
    const integrationApply = vi.fn(
      async ({ alias, entry }: { alias: string; entry: IntegrationEntry }) => {
        Object.defineProperty(installed, alias, {
          value: cloudIntegration(entry),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
    )
    const getBot = vi.fn(async () => cloudBot({ integrations: installed }))

    await makeManager({ getBot, integrationApply }).run()

    expect(integrationApply.mock.calls.map(([argument]) => argument.alias)).toEqual(['16', 'ab'])
    expect(integrationApply).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: 'ab',
        entry: expect.objectContaining({ config: { positive: 1000, negative: -1000 } }),
      })
    )
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath(), 'utf8'))
    expect(snapshot.integrations.ab.config).toEqual({ positive: 1000, negative: -1000 })
    expect(snapshot.integrations['16']).toMatchObject({ name: 'hex-chat', version: '2.0.0' })
  })

  it.each(['alias', 'config-key'] as const)(
    'rejects agent.config __proto__ %s syntax before Cloud access',
    async (variant) => {
      const dependencies =
        variant === 'alias'
          ? `{ integrations: { '__proto__': 'chat@1.0.0' } }`
          : `{ integrations: { chat: { version: 'chat@1.0.0', enabled: false, config: { '__proto__': { unsafe: true } } } } }`
      const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({ dependencies: ${dependencies} })
`
      writeRaw(configPath(), configRaw)
      const getBot = vi.fn(async () => cloudBot({}))

      await expect(makeManager({ getBot }).run()).rejects.toThrow(/__proto__.*(unsupported|lossless)/i)

      expect(getBot).not.toHaveBeenCalled()
      expect(fs.readFileSync(configPath(), 'utf8')).toBe(configRaw)
    }
  )

  it('rejects a legacy JSON config own __proto__ key before Cloud access', async () => {
    const lockRaw =
      '{"version":1,"env":"prod","integrations":{"chat":{"name":"chat","version":"1.0.0","enabled":true,"config":{"__proto__":{"unsafe":true}}}},"plugins":{}}\n'
    writeRaw(lockPath(), lockRaw)
    const getBot = vi.fn(async () => cloudBot({}))

    await expect(makeManager({ getBot }).run()).rejects.toThrow(/__proto__.*(lossy|unsupported)/i)

    expect(getBot).not.toHaveBeenCalled()
    expect(fs.readFileSync(lockPath(), 'utf8')).toBe(lockRaw)
  })

  it('preserves compatible Cloud config for identity-only integration and plugin declarations', async () => {
    writeRaw(
      configPath(),
      `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  dependencies: {
    integrations: { chat: 'chat@1.0.0' },
    plugins: {
      toolkit: {
        version: 'toolkit@2.0.0',
        dependencies: { auditStream: { integrationAlias: 'chat' } },
      },
    },
  },
})
`
    )
    const integrationConfig = { endpoint: 'https://chat.example', mode: 'strict' }
    const pluginConfig = { feature: 'enabled', nested: { limit: 5 } }
    const getBot = vi.fn(async () =>
      cloudBot({
        integrations: {
          chat: cloudIntegration({
            name: 'chat',
            version: '1.0.0',
            enabled: true,
            config: integrationConfig,
          }),
        },
        plugins: {
          toolkit: {
            id: '31',
            name: 'toolkit',
            version: '2.0.0',
            enabled: true,
            configuration: pluginConfig,
            interfaces: {},
            integrations: {
              auditStream: {
                integrationId: 'integration_chat',
                integrationAlias: 'chat',
              },
            },
          },
        },
      })
    )
    const integrationApply = vi.fn()
    const pluginApply = vi.fn()

    await makeManager({ getBot, integrationApply, pluginApply }).run()

    expect(integrationApply).not.toHaveBeenCalled()
    expect(pluginApply).not.toHaveBeenCalled()
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath(), 'utf8'))
    expect(snapshot.integrations.chat.config).toEqual(integrationConfig)
    expect(snapshot.plugins.toolkit.config).toEqual(pluginConfig)
    expect(snapshot.plugins.toolkit.dependencies).toEqual({
      auditStream: { integrationAlias: 'chat' },
    })
  })

  it('rejects a dependency key duplicated across plugin interfaces and direct integrations', async () => {
    const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  dependencies: {
    integrations: { chat: 'chat@1.0.0' },
    plugins: {
      toolkit: {
        version: 'toolkit@2.0.0',
        dependencies: { shared: { integrationAlias: 'chat' } },
      },
    },
    },
})
`
    writeRaw(configPath(), configRaw)
    const lockRaw = `${JSON.stringify({
      version: 1,
      env: 'prod',
      integrations: {
        chat: { name: 'chat', version: '1.0.0', enabled: false, config: {} },
      },
      plugins: {
        toolkit: {
          name: 'toolkit',
          version: '2.0.0',
          enabled: true,
          config: {},
          dependencies: { shared: { integrationAlias: 'chat' } },
        },
      },
    })}\n`
    writeRaw(lockPath(), lockRaw)
    const priorSnapshot = '{"sentinel":"prior snapshot bytes"}\n'
    writeRaw(snapshotPath(), priorSnapshot)
    const getBot = vi.fn(async () =>
      cloudBot({
        integrations: {
          chat: cloudIntegration({ name: 'chat', version: '1.0.0', enabled: false, config: {} }),
        },
        plugins: {
          toolkit: {
            id: '31',
            name: 'toolkit',
            version: '2.0.0',
            enabled: true,
            configuration: {},
            interfaces: {
              shared: {
                integrationId: 'integration_chat',
                integrationAlias: 'chat',
                integrationInterfaceAlias: 'messages',
              },
            },
            integrations: {
              shared: { integrationId: 'integration_chat', integrationAlias: 'chat' },
            },
          },
        },
      })
    )
    const integrationApply = vi.fn()
    const pluginApply = vi.fn()

    await expect(makeManager({ getBot, integrationApply, pluginApply }).run()).rejects.toThrow(
      /duplicated across interfaces and integrations/i
    )

    expect(integrationApply).not.toHaveBeenCalled()
    expect(pluginApply).not.toHaveBeenCalled()
    expect(fs.readFileSync(configPath(), 'utf8')).toBe(configRaw)
    expect(fs.readFileSync(lockPath(), 'utf8')).toBe(lockRaw)
    expect(fs.readFileSync(snapshotPath(), 'utf8')).toBe(priorSnapshot)
    expect(fs.existsSync(markerPath())).toBe(false)
  })

  it('keeps authored constraints in the materialized plan when an older lock omits that field', async () => {
    writeRaw(
      configPath(),
      `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  dependencies: {
    integrations: {
      chat: { version: 'chat@1.0.0', enabled: true, configurationType: 'oauth' },
    },
  },
})
`
    )
    writeRaw(
      lockPath(),
      `${JSON.stringify({
        version: 1,
        env: 'prod',
        integrations: {
          chat: { name: 'chat', version: '1.0.0', enabled: true, config: {} },
        },
        plugins: {},
      })}\n`
    )
    const getBot = vi.fn(async () => cloudBot({}))
    const integrationApply = vi.fn(async () => {
      throw new Error('capture materialized plan')
    })

    await expect(makeManager({ getBot, integrationApply }).run()).rejects.toThrow(/capture materialized plan/)

    expect(integrationApply).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: 'chat',
        entry: expect.objectContaining({ configurationType: 'oauth' }),
      })
    )
  })

  it('preserves shared agent.config when the prod link was changed after its marker was committed', async () => {
    const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({ dependencies: {} })
`
    writeRaw(configPath(), configRaw)
    writeRaw(
      path.join(projectPath, 'agent.json'),
      `${JSON.stringify({
        botId: 'bot_prod_b',
        apiUrl: TARGET.apiUrl,
        workspaceId: TARGET.workspaceId,
      })}\n`
    )
    writeRaw(
      path.join(projectPath, 'agent.local.json'),
      `${JSON.stringify({
        apiUrl: TARGET.apiUrl,
        workspaceId: TARGET.workspaceId,
        devId: 'dev_runtime',
        devTargetBotId: '42',
      })}\n`
    )

    const configDigest = digest(configRaw)
    writeRaw(
      markerPath(),
      `${JSON.stringify({
        version: 2,
        records: {
          prod: {
            target: { ...TARGET, botId: 'bot_prod_a' },
            provenance: {
              kind: 'legacy',
              sources: [{ kind: 'agentConfig', digest: configDigest }],
              planDigest: digest('prod-a-plan'),
            },
            plan: { integrations: [], plugins: [] },
            completed: { integrations: [], plugins: [] },
            completedAt: '2026-07-10T00:00:00.000Z',
          },
        },
      })}\n`
    )

    const devTarget = { ...TARGET, env: 'dev' as const, botId: '42' }
    const getBot = vi.fn(async () => ({
      bot: {
        ...cloudBot({}).bot,
        id: 'dev_runtime',
        dev: true,
        tags: { 'botruntime.devTargetBotId': devTarget.botId },
      },
    }))
    const manager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: devTarget,
      runtimeBotId: 'dev_runtime',
      integrationResolver: { applyToCloud: vi.fn() },
      pluginResolver: { applyToCloud: vi.fn() },
    })

    await manager.run()

    expect(fs.readFileSync(configPath(), 'utf8')).toBe(configRaw)
    expect(JSON.parse(fs.readFileSync(markerPath(), 'utf8')).records).toMatchObject({
      prod: { target: { botId: 'bot_prod_a' } },
      dev: { target: { botId: devTarget.botId } },
    })
  })

  it.each(['missing', 'malformed'] as const)(
    'preserves shared agent.config when agent.local.json becomes %s before cleanup',
    async (variant) => {
      const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({ dependencies: {} })
`
      writeRaw(configPath(), configRaw)
      writeRaw(
        path.join(projectPath, 'agent.local.json'),
        `${JSON.stringify({
          apiUrl: TARGET.apiUrl,
          workspaceId: TARGET.workspaceId,
          devId: 'dev_runtime',
          devTargetBotId: '42',
        })}\n`
      )
      const configDigest = digest(configRaw)
      writeRaw(
        markerPath(),
        `${JSON.stringify({
          version: 2,
          records: {
            prod: {
              target: TARGET,
              provenance: {
                kind: 'legacy',
                sources: [{ kind: 'agentConfig', digest: configDigest }],
                planDigest: digest('prod-plan'),
              },
              plan: { integrations: [], plugins: [] },
              completed: { integrations: [], plugins: [] },
              completedAt: '2026-07-10T00:00:00.000Z',
            },
          },
        })}\n`
      )

      const devTarget = { ...TARGET, env: 'dev' as const, botId: '42' }
      const localPath = path.join(projectPath, 'agent.local.json')
      const getBot = vi.fn(async () => {
        if (variant === 'missing') fs.unlinkSync(localPath)
        else fs.writeFileSync(localPath, '{malformed\n')
        return {
          bot: {
            ...cloudBot({}).bot,
            id: 'dev_runtime',
            dev: true,
            tags: { 'botruntime.devTargetBotId': devTarget.botId },
          },
        }
      })
      const manager = new DependencyMigrationManager({
        projectPath,
        client: { getBot } as any,
        target: devTarget,
        runtimeBotId: 'dev_runtime',
        integrationResolver: { applyToCloud: vi.fn() },
        pluginResolver: { applyToCloud: vi.fn() },
      })

      await manager.run()

      expect(fs.readFileSync(configPath(), 'utf8')).toBe(configRaw)
    }
  )

  it('validates completed pending aliases against initial Cloud before applying an incomplete alias', async () => {
    const state = {
      version: 1,
      env: 'prod',
      integrations: {
        alias1: { name: 'one', version: '1.0.0', enabled: true, config: {} },
        alias2: { name: 'two', version: '2.0.0', enabled: true, config: {} },
      },
      plugins: {},
    }
    const lockRaw = writeRaw(lockPath(), `${JSON.stringify(state, null, 2)}\n`)
    let failAlias2 = true
    const integrationApply = vi.fn(async ({ alias }: { alias: string }) => {
      if (alias === 'alias2' && failAlias2) throw new Error('seed partial journal')
    })
    const getBot = vi.fn(async () => cloudBot({}))

    await makeManager({ getBot, integrationApply }).run().catch(() => undefined)
    const pendingRaw = fs.readFileSync(pendingPath(), 'utf8')
    expect(JSON.parse(pendingRaw).completed.integrations).toEqual(['alias1'])
    const applyCalls = integrationApply.mock.calls.length
    failAlias2 = false

    await expect(makeManager({ getBot, integrationApply }).run()).rejects.toThrow(
      /completed.*alias1|alias1.*(missing|conflict)|pending.*Cloud/i
    )

    expect(integrationApply).toHaveBeenCalledTimes(applyCalls)
    expect(fs.readFileSync(pendingPath(), 'utf8')).toBe(pendingRaw)
    expect(fs.readFileSync(lockPath(), 'utf8')).toBe(lockRaw)
  })

  it.each(['top-level', 'dependency-entry'] as const)(
    'rejects an unknown legacy lock %s field before Cloud without changing source bytes',
    async (variant) => {
      const state: Record<string, unknown> = {
        version: 1,
        env: 'prod',
        integrations: {
          chat: {
            name: 'chat',
            version: '1.0.0',
            enabled: true,
            config: {},
            ...(variant === 'dependency-entry' ? { futureFlag: 'must-not-be-dropped' } : {}),
          },
        },
        plugins: {},
        ...(variant === 'top-level' ? { futureMetadata: { mustNotBeDropped: true } } : {}),
      }
      const lockRaw = writeRaw(lockPath(), `${JSON.stringify(state, null, 2)}\n`)
      const getBot = vi.fn(async () => cloudBot({}))
      const integrationApply = vi.fn()

      await expect(makeManager({ getBot, integrationApply }).run()).rejects.toThrow(
        /legacy.*lock.*(unknown|unsupported|lossless|field)|future/i
      )

      expect(getBot).not.toHaveBeenCalled()
      expect(integrationApply).not.toHaveBeenCalled()
      expect(fs.readFileSync(lockPath(), 'utf8')).toBe(lockRaw)
      expect(fs.existsSync(pendingPath())).toBe(false)
    }
  )
})
