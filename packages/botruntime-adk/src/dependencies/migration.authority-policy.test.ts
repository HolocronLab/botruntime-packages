import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@holocronlab/botruntime-runtime', () => ({ extractMissingRequiredFields: vi.fn(() => []) }))

import { DependencyMigrationManager } from './migration.js'

const API_URL = 'https://authority.example'
const WORKSPACE_ID = 'workspace_exact'
const PROD_TARGET = {
  env: 'prod' as const,
  apiUrl: API_URL,
  workspaceId: WORKSPACE_ID,
  botId: 'bot_prod',
}
const DEV_TARGET = {
  env: 'dev' as const,
  apiUrl: API_URL,
  workspaceId: WORKSPACE_ID,
  botId: '42',
}
const RUNTIME_BOT_ID = 'dev_runtime'

const digest = (raw: string): string =>
  `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`

function cloudBot(target: typeof PROD_TARGET | typeof DEV_TARGET, runtimeBotId?: string) {
  return {
    bot: {
      id: runtimeBotId ?? target.botId,
      updatedAt: '2026-07-10T00:00:00.000Z',
      dev: target.env === 'dev',
      tags: target.env === 'dev' ? { 'botruntime.devTargetBotId': target.botId } : {},
      integrations: {},
      plugins: {},
      devReadiness: {
        schemaVersion: 1,
        integrations: { authority: 'authoritative', source: 'integration_installation' },
        plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
        lastDevDeployment: { authority: 'unknown', reason: 'not_required_by_migration_test' },
      },
    },
  }
}

describe('dependency migration authority policy', () => {
  let projectPath: string

  const writeJson = (name: string, value: unknown): void => {
    const filePath = path.join(projectPath, name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`)
  }

  const makeManager = (options: {
    target: typeof PROD_TARGET | typeof DEV_TARGET
    getBot: ReturnType<typeof vi.fn>
    runtimeBotId?: string
    authority: unknown
  }): DependencyMigrationManager =>
    new DependencyMigrationManager({
      projectPath,
      client: { getBot: options.getBot } as any,
      target: options.target,
      runtimeBotId: options.runtimeBotId,
      authority: options.authority,
      integrationResolver: { applyToCloud: vi.fn() },
      pluginResolver: { applyToCloud: vi.fn() },
    } as any)

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-migration-authority-policy-'))
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('uses agentLocalBot as the exact prod proof and ignores a foreign agent.json', async () => {
    writeJson('agent.json', {
      botId: 'bot_foreign',
      apiUrl: 'https://foreign.example',
      workspaceId: 'workspace_foreign',
    })
    writeJson('agent.local.json', {
      botId: PROD_TARGET.botId,
      apiUrl: PROD_TARGET.apiUrl,
      workspaceId: PROD_TARGET.workspaceId,
    })
    const getBot = vi.fn(async () => cloudBot(PROD_TARGET))

    await makeManager({
      target: PROD_TARGET,
      getBot,
      authority: { source: 'agentLocalBot' },
    }).run()

    expect(getBot).toHaveBeenCalledWith({ id: PROD_TARGET.botId })
    expect(
      JSON.parse(fs.readFileSync(path.join(projectPath, '.adk', 'dependencies', 'prod.json'), 'utf8')).target
    ).toEqual({ apiUrl: PROD_TARGET.apiUrl, workspaceId: PROD_TARGET.workspaceId, botId: PROD_TARGET.botId })
  })

  it('rejects an agentLocalBot mismatch even when agent.json matches the selected prod target', async () => {
    writeJson('agent.json', {
      botId: PROD_TARGET.botId,
      apiUrl: PROD_TARGET.apiUrl,
      workspaceId: PROD_TARGET.workspaceId,
    })
    writeJson('agent.local.json', {
      botId: 'bot_local_foreign',
      apiUrl: PROD_TARGET.apiUrl,
      workspaceId: PROD_TARGET.workspaceId,
    })
    const getBot = vi.fn(async () => cloudBot(PROD_TARGET))

    await expect(
      makeManager({ target: PROD_TARGET, getBot, authority: { source: 'agentLocalBot' } }).run()
    ).rejects.toThrow(/agent\.local|authority|target/i)

    expect(getBot).not.toHaveBeenCalled()
  })

  it('accepts an explicit prod authority without reading or writing project links', async () => {
    const getBot = vi.fn(async () => cloudBot(PROD_TARGET))

    await makeManager({
      target: PROD_TARGET,
      getBot,
      authority: { source: 'explicit', botId: PROD_TARGET.botId },
    }).run()

    expect(getBot).toHaveBeenCalledWith({ id: PROD_TARGET.botId })
    expect(fs.existsSync(path.join(projectPath, 'agent.json'))).toBe(false)
    expect(fs.existsSync(path.join(projectPath, 'agent.local.json'))).toBe(false)
  })

  it.each(['', ' bot_prod ', 'bot_other'])(
    'rejects explicit prod proof %j before Cloud even when agent.json matches',
    async (explicitBotId) => {
      writeJson('agent.json', {
        botId: PROD_TARGET.botId,
        apiUrl: PROD_TARGET.apiUrl,
        workspaceId: PROD_TARGET.workspaceId,
      })
      const getBot = vi.fn(async () => cloudBot(PROD_TARGET))

      expect(() =>
        makeManager({
          target: PROD_TARGET,
          getBot,
          authority: { source: 'explicit', botId: explicitBotId },
        })
      ).toThrow(/explicit|authority|bot/i)

      expect(getBot).not.toHaveBeenCalled()
    }
  )

  it('uses attested dev coordinates while still proving both dev IDs from agent.local', async () => {
    const localBytes = `${JSON.stringify({
      apiUrl: 'http://local-stack.example',
      workspaceId: 'workspace_local',
      devId: RUNTIME_BOT_ID,
      devTargetBotId: DEV_TARGET.botId,
      devApiUrl: DEV_TARGET.apiUrl,
      devWorkspaceId: DEV_TARGET.workspaceId,
    })}\n`
    fs.writeFileSync(path.join(projectPath, 'agent.local.json'), localBytes)
    const getBot = vi.fn(async () => cloudBot(DEV_TARGET, RUNTIME_BOT_ID))

    await makeManager({
      target: DEV_TARGET,
      runtimeBotId: RUNTIME_BOT_ID,
      getBot,
      authority: {
        source: 'agentLocalDev',
        coordinates: { source: 'attested', apiUrl: DEV_TARGET.apiUrl, workspaceId: DEV_TARGET.workspaceId },
      },
    }).run()

    expect(getBot).toHaveBeenCalledWith({ id: RUNTIME_BOT_ID })
    expect(fs.readFileSync(path.join(projectPath, 'agent.local.json'), 'utf8')).toBe(localBytes)
  })

  it('uses an unscoped legacy devId only as a selected-stack runtime hint', async () => {
    writeJson('agent.local.json', {
      apiUrl: 'http://local-stack.example',
      workspaceId: 'workspace_local',
      devId: RUNTIME_BOT_ID,
      devTargetBotId: '999',
    })
    const getBot = vi.fn(async () => cloudBot(DEV_TARGET, RUNTIME_BOT_ID))

    await makeManager({
      target: DEV_TARGET,
      runtimeBotId: RUNTIME_BOT_ID,
      getBot,
      authority: {
        source: 'agentLocalDev',
        coordinates: { source: 'attested', apiUrl: DEV_TARGET.apiUrl, workspaceId: DEV_TARGET.workspaceId },
      },
    }).run()

    expect(getBot).toHaveBeenCalledTimes(1)
    expect(getBot).toHaveBeenCalledWith({ id: RUNTIME_BOT_ID })
    const marker = JSON.parse(
      fs.readFileSync(path.join(projectPath, '.adk', 'dependencies', 'migration.json'), 'utf8')
    )
    expect(marker.records.dev.target).toEqual(DEV_TARGET)
    expect(marker.records.dev.runtimeBotId).toBe(RUNTIME_BOT_ID)
  })

  it.each([
    {
      label: 'foreign',
      scope: { devApiUrl: 'https://foreign.example', devWorkspaceId: 'workspace_foreign' },
    },
    {
      label: 'partial apiUrl',
      scope: { devApiUrl: DEV_TARGET.apiUrl },
    },
    {
      label: 'partial workspaceId',
      scope: { devWorkspaceId: DEV_TARGET.workspaceId },
    },
  ])('rejects $label dev scope evidence under attested authority before Cloud access', async ({ scope }) => {
    writeJson('agent.local.json', {
      apiUrl: 'http://local-stack.example',
      workspaceId: 'workspace_local',
      devId: RUNTIME_BOT_ID,
      devTargetBotId: DEV_TARGET.botId,
      ...scope,
    })
    const getBot = vi.fn(async () => cloudBot(DEV_TARGET, RUNTIME_BOT_ID))

    await expect(
      makeManager({
        target: DEV_TARGET,
        runtimeBotId: RUNTIME_BOT_ID,
        getBot,
        authority: {
          source: 'agentLocalDev',
          coordinates: { source: 'attested', apiUrl: DEV_TARGET.apiUrl, workspaceId: DEV_TARGET.workspaceId },
        },
      }).run()
    ).rejects.toThrow(/dev.*(scope|apiUrl|workspace)|authority|target/i)

    expect(getBot).not.toHaveBeenCalled()
  })

  it('requires exact Cloud proof before marker-hit cleanup for an unscoped dev runtime hint', async () => {
    writeJson('agent.local.json', {
      apiUrl: 'http://local-stack.example',
      workspaceId: 'workspace_local',
      devId: RUNTIME_BOT_ID,
      devTargetBotId: '999',
    })
    const lockRaw = `${JSON.stringify({ version: 1, env: 'dev', integrations: {}, plugins: {} })}\n`
    const lockPath = path.join(projectPath, 'dependencies.dev.lock.json')
    fs.writeFileSync(lockPath, lockRaw)
    const source = { kind: 'lock', digest: digest(lockRaw) }
    const planDigest = digest('marker-hit-plan')
    const progress = { integrations: [], plugins: [] }
    writeJson('.adk/dependencies/migration.json', {
      version: 2,
      records: {
        dev: {
          target: DEV_TARGET,
          runtimeBotId: RUNTIME_BOT_ID,
          provenance: { kind: 'legacy', sources: [source], planDigest },
          plan: progress,
          completed: progress,
          completedAt: '2026-07-10T00:00:00.000Z',
        },
      },
    })
    const pendingPath = path.join(projectPath, '.adk', 'dependencies', 'migration.dev.pending.json')
    writeJson('.adk/dependencies/migration.dev.pending.json', {
      version: 2,
      target: DEV_TARGET,
      sources: [source],
      plan: { digest: planDigest, ...progress },
      completed: progress,
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z',
    })
    const wrongTargetBot = cloudBot(DEV_TARGET, RUNTIME_BOT_ID) as any
    wrongTargetBot.bot.tags['botruntime.devTargetBotId'] = '41'
    const getBot = vi
      .fn()
      .mockResolvedValueOnce(wrongTargetBot)
      .mockResolvedValueOnce(cloudBot(DEV_TARGET, RUNTIME_BOT_ID))
    const options = {
      target: DEV_TARGET,
      runtimeBotId: RUNTIME_BOT_ID,
      getBot,
      authority: {
        source: 'agentLocalDev',
        coordinates: { source: 'attested', apiUrl: DEV_TARGET.apiUrl, workspaceId: DEV_TARGET.workspaceId },
      },
    } as const

    await expect(makeManager(options).run()).rejects.toThrow(/target|tag|42/i)
    expect(getBot).toHaveBeenNthCalledWith(1, { id: RUNTIME_BOT_ID })
    expect(fs.existsSync(lockPath)).toBe(true)
    expect(fs.existsSync(pendingPath)).toBe(true)

    await expect(makeManager(options).run()).resolves.toMatchObject({
      skipped: [{ env: 'dev', reason: 'migration already completed' }],
    })
    expect(getBot).toHaveBeenNthCalledWith(2, { id: RUNTIME_BOT_ID })
    expect(fs.existsSync(lockPath)).toBe(false)
    expect(fs.existsSync(pendingPath)).toBe(false)
  })

  it('rejects attested coordinates that differ from the selected dev target before Cloud', async () => {
    writeJson('agent.local.json', {
      apiUrl: DEV_TARGET.apiUrl,
      workspaceId: DEV_TARGET.workspaceId,
      devId: RUNTIME_BOT_ID,
      devTargetBotId: DEV_TARGET.botId,
      devApiUrl: DEV_TARGET.apiUrl,
      devWorkspaceId: DEV_TARGET.workspaceId,
    })
    const getBot = vi.fn(async () => cloudBot(DEV_TARGET, RUNTIME_BOT_ID))

    expect(() =>
      makeManager({
        target: DEV_TARGET,
        runtimeBotId: RUNTIME_BOT_ID,
        getBot,
        authority: {
          source: 'agentLocalDev',
          coordinates: {
            source: 'attested',
            apiUrl: 'https://foreign.example',
            workspaceId: DEV_TARGET.workspaceId,
          },
        },
      })
    ).toThrow(/attested|authority|apiUrl|target/i)

    expect(getBot).not.toHaveBeenCalled()
  })

  it.each([
    ['link', { source: 'link' }],
    [
      'attested',
      { source: 'attested', apiUrl: DEV_TARGET.apiUrl, workspaceId: DEV_TARGET.workspaceId },
    ],
  ] as const)('requires exact dev IDs under %s coordinate authority', async (_label, coordinates) => {
    writeJson('agent.local.json', {
      apiUrl: DEV_TARGET.apiUrl,
      workspaceId: DEV_TARGET.workspaceId,
      devId: 'dev_other',
      devTargetBotId: DEV_TARGET.botId,
    })
    const getBot = vi.fn(async () => cloudBot(DEV_TARGET, RUNTIME_BOT_ID))

    await expect(
      makeManager({
        target: DEV_TARGET,
        runtimeBotId: RUNTIME_BOT_ID,
        getBot,
        authority: { source: 'agentLocalDev', coordinates },
      }).run()
    ).rejects.toThrow(/runtime|devId|authority|target/i)

    expect(getBot).not.toHaveBeenCalled()
  })

  it.each([
    ['agentLocalBot', { source: 'agentLocalBot' }],
    ['explicit', { source: 'explicit', botId: PROD_TARGET.botId }],
  ] as const)('preserves the prod legacy lock under non-canonical %s authority', async (_label, authority) => {
    writeJson('agent.json', {
      botId: PROD_TARGET.botId,
      apiUrl: PROD_TARGET.apiUrl,
      workspaceId: PROD_TARGET.workspaceId,
    })
    writeJson('agent.local.json', {
      botId: PROD_TARGET.botId,
      apiUrl: PROD_TARGET.apiUrl,
      workspaceId: PROD_TARGET.workspaceId,
    })
    const lockPath = path.join(projectPath, 'dependencies.prod.lock.json')
    const lockRaw = `${JSON.stringify({ version: 1, env: 'prod', integrations: {}, plugins: {} })}\n`
    fs.writeFileSync(lockPath, lockRaw)
    const getBot = vi.fn(async () => cloudBot(PROD_TARGET))

    await makeManager({ target: PROD_TARGET, getBot, authority }).run()

    expect(fs.readFileSync(lockPath, 'utf8')).toBe(lockRaw)
  })

  it('preserves a non-canonical legacy lock on completion retry after authoritative Cloud refresh', async () => {
    writeJson('agent.json', {
      botId: PROD_TARGET.botId,
      apiUrl: PROD_TARGET.apiUrl,
      workspaceId: PROD_TARGET.workspaceId,
    })
    const lockPath = path.join(projectPath, 'dependencies.prod.lock.json')
    const lockRaw = `${JSON.stringify({ version: 1, env: 'prod', integrations: {}, plugins: {} })}\n`
    fs.writeFileSync(lockPath, lockRaw)
    writeJson('.adk/dependencies/migration.json', {
      version: 2,
      records: {
        prod: {
          target: PROD_TARGET,
          provenance: {
            kind: 'legacy',
            sources: [{ kind: 'lock', digest: digest(lockRaw) }],
            planDigest: digest('explicit-plan'),
          },
          plan: { integrations: [], plugins: [] },
          completed: { integrations: [], plugins: [] },
          completedAt: '2026-07-10T00:00:00.000Z',
        },
      },
    })
    const getBot = vi.fn(async () => cloudBot(PROD_TARGET))

    await makeManager({
      target: PROD_TARGET,
      getBot,
      authority: { source: 'explicit', botId: PROD_TARGET.botId },
    }).run()

    expect(getBot).toHaveBeenCalledOnce()
    expect(getBot).toHaveBeenCalledWith({ id: PROD_TARGET.botId })
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(lockRaw)
  })

  it('attested dev removes its env lock after exact ID proof while preserving local stack coordinates', async () => {
    const localBytes = `${JSON.stringify({
      apiUrl: 'http://local-stack.example',
      workspaceId: 'workspace_local',
      devId: RUNTIME_BOT_ID,
      devTargetBotId: DEV_TARGET.botId,
      devApiUrl: DEV_TARGET.apiUrl,
      devWorkspaceId: DEV_TARGET.workspaceId,
    })}\n`
    fs.writeFileSync(path.join(projectPath, 'agent.local.json'), localBytes)
    const lockPath = path.join(projectPath, 'dependencies.dev.lock.json')
    fs.writeFileSync(
      lockPath,
      `${JSON.stringify({ version: 1, env: 'dev', integrations: {}, plugins: {} })}\n`
    )
    const getBot = vi.fn(async () => cloudBot(DEV_TARGET, RUNTIME_BOT_ID))

    await makeManager({
      target: DEV_TARGET,
      runtimeBotId: RUNTIME_BOT_ID,
      getBot,
      authority: {
        source: 'agentLocalDev',
        coordinates: { source: 'attested', apiUrl: DEV_TARGET.apiUrl, workspaceId: DEV_TARGET.workspaceId },
      },
    }).run()

    expect(fs.existsSync(lockPath)).toBe(false)
    expect(fs.readFileSync(path.join(projectPath, 'agent.local.json'), 'utf8')).toBe(localBytes)
  })

  it('cleans shared config when attested dev completes first and canonical prod completes later', async () => {
    const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({ dependencies: {} })
`
    fs.writeFileSync(path.join(projectPath, 'agent.config.ts'), configRaw)
    writeJson('agent.json', {
      botId: PROD_TARGET.botId,
      apiUrl: PROD_TARGET.apiUrl,
      workspaceId: PROD_TARGET.workspaceId,
    })
    writeJson('agent.local.json', {
      apiUrl: 'http://local-stack.example',
      workspaceId: 'workspace_local',
      devId: RUNTIME_BOT_ID,
      devTargetBotId: DEV_TARGET.botId,
      devApiUrl: DEV_TARGET.apiUrl,
      devWorkspaceId: DEV_TARGET.workspaceId,
    })
    const devGetBot = vi.fn(async () => cloudBot(DEV_TARGET, RUNTIME_BOT_ID))
    await makeManager({
      target: DEV_TARGET,
      runtimeBotId: RUNTIME_BOT_ID,
      getBot: devGetBot,
      authority: {
        source: 'agentLocalDev',
        coordinates: { source: 'attested', apiUrl: DEV_TARGET.apiUrl, workspaceId: DEV_TARGET.workspaceId },
      },
    }).run()

    const prodGetBot = vi.fn(async () => cloudBot(PROD_TARGET))
    await makeManager({ target: PROD_TARGET, getBot: prodGetBot, authority: { source: 'agent' } }).run()

    expect(fs.readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')).not.toContain('dependencies')
    const marker = JSON.parse(
      fs.readFileSync(path.join(projectPath, '.adk', 'dependencies', 'migration.json'), 'utf8')
    )
    expect(marker.records.dev.runtimeBotId).toBe(RUNTIME_BOT_ID)
  })

  it('preserves shared config when dev IDs were relinked after attested completion', async () => {
    const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({ dependencies: {} })
`
    fs.writeFileSync(path.join(projectPath, 'agent.config.ts'), configRaw)
    writeJson('agent.json', {
      botId: PROD_TARGET.botId,
      apiUrl: PROD_TARGET.apiUrl,
      workspaceId: PROD_TARGET.workspaceId,
    })
    writeJson('agent.local.json', {
      devId: RUNTIME_BOT_ID,
      devTargetBotId: DEV_TARGET.botId,
      devApiUrl: DEV_TARGET.apiUrl,
      devWorkspaceId: DEV_TARGET.workspaceId,
    })
    await makeManager({
      target: DEV_TARGET,
      runtimeBotId: RUNTIME_BOT_ID,
      getBot: vi.fn(async () => cloudBot(DEV_TARGET, RUNTIME_BOT_ID)),
      authority: {
        source: 'agentLocalDev',
        coordinates: { source: 'attested', apiUrl: DEV_TARGET.apiUrl, workspaceId: DEV_TARGET.workspaceId },
      },
    }).run()
    writeJson('agent.local.json', {
      devId: 'dev_relinked',
      devTargetBotId: DEV_TARGET.botId,
      devApiUrl: DEV_TARGET.apiUrl,
      devWorkspaceId: DEV_TARGET.workspaceId,
    })

    await makeManager({
      target: PROD_TARGET,
      getBot: vi.fn(async () => cloudBot(PROD_TARGET)),
      authority: { source: 'agent' },
    }).run()

    expect(fs.readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')).toBe(configRaw)
  })

  it('preserves shared config when an old dev completion record has no runtime evidence', async () => {
    const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({ dependencies: {} })
`
    fs.writeFileSync(path.join(projectPath, 'agent.config.ts'), configRaw)
    writeJson('agent.json', {
      botId: PROD_TARGET.botId,
      apiUrl: PROD_TARGET.apiUrl,
      workspaceId: PROD_TARGET.workspaceId,
    })
    writeJson('agent.local.json', {
      apiUrl: DEV_TARGET.apiUrl,
      workspaceId: DEV_TARGET.workspaceId,
      devId: RUNTIME_BOT_ID,
      devTargetBotId: DEV_TARGET.botId,
    })
    const configDigest = digest(configRaw)
    writeJson('.adk/dependencies/migration.json', {
      version: 2,
      records: {
        dev: {
          target: DEV_TARGET,
          provenance: {
            kind: 'legacy',
            sources: [{ kind: 'agentConfig', digest: configDigest }],
            planDigest: digest('old-dev-plan'),
          },
          plan: { integrations: [], plugins: [] },
          completed: { integrations: [], plugins: [] },
          completedAt: '2026-07-09T00:00:00.000Z',
        },
      },
    })

    await makeManager({
      target: PROD_TARGET,
      getBot: vi.fn(async () => cloudBot(PROD_TARGET)),
      authority: { source: 'agent' },
    }).run()

    expect(fs.readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')).toBe(configRaw)
  })
})
