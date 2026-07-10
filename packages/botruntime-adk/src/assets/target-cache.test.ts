import crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  constructorOptions: [] as Array<Record<string, unknown>>,
}))

vi.mock('@holocronlab/botruntime-client', () => ({
  Client: class Client {
    constructor(options: Record<string, unknown>) {
      clientMocks.constructorOptions.push(options)
    }

    listFiles = clientMocks.listFiles
  },
}))

import { clearProjectClientCache } from '../auth/index.js'
import { generateAssetsRuntime } from '../generators/assets.js'
import { AssetsCacheManager, type AssetsCacheScope } from './cache.js'
import { AssetsManager } from './manager.js'
import type { AssetFile } from './types.js'

const DEV_CONNECTION = { token: 'dev_token', apiUrl: 'https://dev.local', workspaceId: 'dev_ws' }
const PROD_CONNECTION = { token: 'prod_token', apiUrl: 'https://cloud.example', workspaceId: 'prod_ws' }
const DEV_SCOPE: AssetsCacheScope = {
  environment: 'dev',
  botId: 'dev_bot',
  apiUrl: DEV_CONNECTION.apiUrl,
  workspaceId: DEV_CONNECTION.workspaceId,
}
const PROD_SCOPE: AssetsCacheScope = {
  environment: 'prod',
  botId: 'prod_bot',
  apiUrl: PROD_CONNECTION.apiUrl,
  workspaceId: PROD_CONNECTION.workspaceId,
}
const ASSET_PATH = 'terms.txt'
const ASSET_CONTENT = 'authoritative asset content'
const LOCAL_HASH = crypto.createHash('sha256').update(ASSET_CONTENT).digest('hex')

const metadata = (url: string, fileId: string): AssetFile => ({
  path: ASSET_PATH,
  name: ASSET_PATH,
  size: ASSET_CONTENT.length,
  mime: 'text/plain',
  hash: LOCAL_HASH,
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
  fileId,
  url,
})

const cacheFor = (projectPath: string, scope: AssetsCacheScope) =>
  new AssetsCacheManager(projectPath, { scope })

const seedCache = async (projectPath: string, scope: AssetsCacheScope, asset: AssetFile, localHash = LOCAL_HASH) => {
  await cacheFor(projectPath, scope).setEntry(ASSET_PATH, localHash, asset.hash, asset)
}

describe('target-scoped asset generation cache', () => {
  let projectPath: string

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-assets-target-cache-'))
    fs.mkdirSync(path.join(projectPath, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(projectPath, 'assets', ASSET_PATH), ASSET_CONTENT)
    clientMocks.constructorOptions.length = 0
    clearProjectClientCache()
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    clearProjectClientCache()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('uses fresh prod metadata instead of a prior dev cache and reads local hashes from the prod scope', async () => {
    await seedCache(projectPath, DEV_SCOPE, metadata('DEV_URL', 'dev_file'), 'DEV_LOCAL_HASH')
    clientMocks.listFiles.mockResolvedValue({
      files: [
        {
          key: ASSET_PATH,
          size: ASSET_CONTENT.length,
          contentType: 'text/plain',
          createdAt: '2026-07-09T00:00:00.000Z',
          updatedAt: '2026-07-09T00:00:00.000Z',
          id: 'prod_file',
          url: 'PROD_URL',
          tags: { path: ASSET_PATH, hash: LOCAL_HASH },
        },
      ],
    })

    await generateAssetsRuntime(projectPath, PROD_SCOPE.botId, {
      dev: false,
      credentials: PROD_CONNECTION,
      cacheScope: PROD_SCOPE,
      failOnRemoteFetchError: true,
    })

    const runtime = fs.readFileSync(path.join(projectPath, '.adk', 'assets-runtime.ts'), 'utf8')
    const prodCache = await cacheFor(projectPath, PROD_SCOPE).getEntry(ASSET_PATH)
    const devCache = await cacheFor(projectPath, DEV_SCOPE).getEntry(ASSET_PATH)

    expect(runtime).toContain('PROD_URL')
    expect(runtime).toContain(`"${ASSET_PATH}": "${LOCAL_HASH}"`)
    expect(runtime).not.toContain('DEV_URL')
    expect(runtime).not.toContain('DEV_LOCAL_HASH')
    expect(prodCache?.metadata.url).toBe('PROD_URL')
    expect(devCache?.metadata.url).toBe('DEV_URL')
  })

  it('fails closed on a prod fetch error even when dev and prod caches exist', async () => {
    await seedCache(projectPath, DEV_SCOPE, metadata('DEV_URL', 'dev_file'))
    await seedCache(projectPath, PROD_SCOPE, metadata('STALE_PROD_URL', 'stale_prod_file'))
    clientMocks.listFiles.mockRejectedValue(new Error('prod auth failed'))

    await expect(
      generateAssetsRuntime(projectPath, PROD_SCOPE.botId, {
        dev: false,
        credentials: PROD_CONNECTION,
        cacheScope: PROD_SCOPE,
        failOnRemoteFetchError: true,
      })
    ).rejects.toThrow(/asset|prod auth failed/i)

    expect(fs.existsSync(path.join(projectPath, '.adk', 'assets-runtime.ts'))).toBe(false)
  })

  it('defaults direct production AssetsManager reads to fail closed', async () => {
    await seedCache(projectPath, PROD_SCOPE, metadata('STALE_PROD_URL', 'stale_prod_file'))
    clientMocks.listFiles.mockRejectedValue(new Error('prod authority unavailable'))
    const manager = new AssetsManager({
      projectPath,
      botId: PROD_SCOPE.botId,
      credentials: PROD_CONNECTION,
      cacheScope: PROD_SCOPE,
    })

    await expect(manager.getEnrichedLocalAssets()).rejects.toThrow(/asset|prod authority unavailable/i)
  })

  it('defaults direct production runtime generation to fail closed and forbids an unsafe override', async () => {
    await seedCache(projectPath, PROD_SCOPE, metadata('STALE_PROD_URL', 'stale_prod_file'))
    clientMocks.listFiles.mockRejectedValue(new Error('prod authority unavailable'))

    await expect(
      generateAssetsRuntime(projectPath, PROD_SCOPE.botId, {
        dev: false,
        credentials: PROD_CONNECTION,
        cacheScope: PROD_SCOPE,
      })
    ).rejects.toThrow(/asset|prod authority unavailable/i)
    expect(
      () =>
        new AssetsManager({
          projectPath,
          botId: PROD_SCOPE.botId,
          credentials: PROD_CONNECTION,
          cacheScope: PROD_SCOPE,
          failOnRemoteFetchError: false,
        })
    ).toThrow(/production.*fail-closed|cannot be tolerated/i)
  })

  it('uses only the dev-scoped cache during a dev outage', async () => {
    await seedCache(projectPath, DEV_SCOPE, metadata('DEV_URL', 'dev_file'))
    await seedCache(projectPath, PROD_SCOPE, metadata('PROD_URL', 'prod_file'))
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    clientMocks.listFiles.mockRejectedValue(new Error('dev server unavailable'))

    await generateAssetsRuntime(projectPath, DEV_SCOPE.botId, {
      dev: true,
      credentials: DEV_CONNECTION,
      cacheScope: DEV_SCOPE,
      failOnRemoteFetchError: false,
    })

    const runtime = fs.readFileSync(path.join(projectPath, '.adk', 'assets-runtime.ts'), 'utf8')
    expect(runtime).toContain('DEV_URL')
    expect(runtime).not.toContain('PROD_URL')
  })

  it('does not reuse a cache from another stack with the same environment and bot ID', async () => {
    const firstStackScope: AssetsCacheScope = {
      environment: 'dev',
      botId: '42',
      apiUrl: 'https://first-stack.example',
      workspaceId: 'shared-looking-workspace',
    }
    const secondStackScope: AssetsCacheScope = {
      environment: 'dev',
      botId: '42',
      apiUrl: DEV_CONNECTION.apiUrl,
      workspaceId: DEV_CONNECTION.workspaceId,
    }
    await seedCache(projectPath, firstStackScope, metadata('FOREIGN_URL', 'foreign_file'))
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    clientMocks.listFiles.mockRejectedValue(new Error('second stack unavailable'))

    await generateAssetsRuntime(projectPath, '42', {
      dev: true,
      credentials: DEV_CONNECTION,
      cacheScope: secondStackScope,
      failOnRemoteFetchError: false,
    })

    const runtime = fs.readFileSync(path.join(projectPath, '.adk', 'assets-runtime.ts'), 'utf8')
    expect(runtime).not.toContain('FOREIGN_URL')
    expect(runtime).toContain(`__PLACEHOLDER_URL_${ASSET_PATH}__`)
    expect((await cacheFor(projectPath, secondStackScope).getEntry(ASSET_PATH))?.metadata.url).not.toBe('FOREIGN_URL')
  })

  it('rejects an authority-scoped ambient write before it can contaminate a later target outage', async () => {
    const targetScope: AssetsCacheScope = {
      environment: 'dev',
      botId: '42',
      apiUrl: 'https://target-a.example',
      workspaceId: 'target_a_workspace',
    }
    clientMocks.listFiles.mockResolvedValue({
      files: [
        {
          key: ASSET_PATH,
          id: 'foreign_b_file',
          url: 'FOREIGN_B_URL',
          tags: { path: ASSET_PATH, hash: LOCAL_HASH },
        },
      ],
    })

    await expect(
      generateAssetsRuntime(projectPath, '42', {
        dev: true,
        cacheScope: targetScope,
        failOnRemoteFetchError: false,
      })
    ).rejects.toThrow(/explicit credentials|authority/i)
    expect(clientMocks.listFiles).not.toHaveBeenCalled()
    expect(await cacheFor(projectPath, targetScope).getEntry(ASSET_PATH)).toBeNull()

    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    clientMocks.listFiles.mockRejectedValue(new Error('target A unavailable'))
    await generateAssetsRuntime(projectPath, '42', {
      dev: true,
      credentials: {
        token: 'target_a_token',
        apiUrl: targetScope.apiUrl!,
        workspaceId: targetScope.workspaceId!,
      },
      cacheScope: targetScope,
      failOnRemoteFetchError: false,
    })

    const runtime = fs.readFileSync(path.join(projectPath, '.adk', 'assets-runtime.ts'), 'utf8')
    expect(runtime).not.toContain('FOREIGN_B_URL')
    expect(runtime).toContain(`__PLACEHOLDER_URL_${ASSET_PATH}__`)
  })

  it('rejects an authority-scoped bootstrap cache without explicit matching credentials', async () => {
    await expect(
      generateAssetsRuntime(projectPath, undefined, {
        dev: true,
        cacheScope: {
          environment: 'dev',
          apiUrl: 'https://target-a.example',
          workspaceId: 'target_a_workspace',
        },
        failOnRemoteFetchError: false,
      })
    ).rejects.toThrow(/explicit credentials|authority/i)
    expect(clientMocks.listFiles).not.toHaveBeenCalled()
  })

  it('disables legacy cache fallback when explicit credentials omit an authority scope', async () => {
    const legacyCache = new AssetsCacheManager(projectPath)
    await legacyCache.setEntry(ASSET_PATH, LOCAL_HASH, LOCAL_HASH, metadata('FOREIGN_LEGACY_URL', 'foreign_file'))
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    clientMocks.listFiles.mockRejectedValue(new Error('target unavailable'))

    const manager = new AssetsManager({
      projectPath,
      botId: '42',
      credentials: DEV_CONNECTION,
      failOnRemoteFetchError: false,
    })
    const enriched = await manager.getEnrichedLocalAssets()

    expect(enriched).toHaveLength(1)
    expect(enriched[0]?.url).toBe(`__PLACEHOLDER_URL_${ASSET_PATH}__`)
    expect(enriched[0]?.url).not.toBe('FOREIGN_LEGACY_URL')
    expect((await legacyCache.getEntry(ASSET_PATH))?.metadata.url).toBe('FOREIGN_LEGACY_URL')
  })

  it('rejects partial explicit credentials before a poisoned project can receive the PAT', async () => {
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        botId: 'poison_bot',
        workspaceId: 'poison_workspace',
        apiUrl: 'https://poison.invalid',
      })
    )
    clientMocks.listFiles.mockResolvedValue({ files: [] })

    await expect(
      (async () => {
        const manager = new AssetsManager({
          projectPath,
          botId: '42',
          credentials: { token: 'partial_pat', apiUrl: 'https://intended.example' },
        })
        await manager.getRemoteAssets()
      })()
    ).rejects.toThrow(/workspace|explicit credentials/i)

    expect(clientMocks.constructorOptions).toHaveLength(0)
    expect(clientMocks.listFiles).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'another bot', botId: 'target_a', scopedBotId: 'target_b' },
    { label: 'bootstrap scope', botId: 'target_a', scopedBotId: undefined },
    { label: 'missing target', botId: undefined, scopedBotId: 'target_b' },
  ])('rejects a direct AssetsManager cache scope for $label before client/cache access', ({ botId, scopedBotId }) => {
    expect(
      () =>
        new AssetsManager({
          projectPath,
          botId,
          credentials: DEV_CONNECTION,
          cacheScope: {
            environment: 'dev',
            ...(scopedBotId ? { botId: scopedBotId } : {}),
            apiUrl: DEV_CONNECTION.apiUrl,
            workspaceId: DEV_CONNECTION.workspaceId,
          },
        })
    ).toThrow(/scope.*bot|bot.*scope/i)
    expect(clientMocks.constructorOptions).toHaveLength(0)
  })

  it('does not resurrect cached metadata when an authoritative fetch says the remote asset is absent', async () => {
    await seedCache(projectPath, DEV_SCOPE, metadata('DELETED_REMOTE_URL', 'deleted_remote_file'))
    clientMocks.listFiles.mockResolvedValue({ files: [] })

    await generateAssetsRuntime(projectPath, DEV_SCOPE.botId, {
      dev: true,
      credentials: DEV_CONNECTION,
      cacheScope: DEV_SCOPE,
      failOnRemoteFetchError: false,
    })

    const runtime = fs.readFileSync(path.join(projectPath, '.adk', 'assets-runtime.ts'), 'utf8')
    expect(runtime).not.toContain('DELETED_REMOTE_URL')
    expect(runtime).toContain(`__PLACEHOLDER_URL_${ASSET_PATH}__`)
    expect(await cacheFor(projectPath, DEV_SCOPE).getEntry(ASSET_PATH)).toBeNull()
  })

  it('uses the numeric dev control target and exact dev credentials for remote asset calls', async () => {
    const opaqueRuntimeBotId = 'dev_opaque_must_not_reach_assets'
    const devTargetBotId = '42'
    clientMocks.listFiles.mockResolvedValue({ files: [] })

    await generateAssetsRuntime(projectPath, devTargetBotId, {
      dev: true,
      credentials: DEV_CONNECTION,
      cacheScope: { environment: 'dev', botId: devTargetBotId },
      failOnRemoteFetchError: false,
    })

    expect(clientMocks.constructorOptions).toHaveLength(1)
    expect(clientMocks.constructorOptions[0]).toMatchObject({
      token: DEV_CONNECTION.token,
      apiUrl: DEV_CONNECTION.apiUrl,
      workspaceId: DEV_CONNECTION.workspaceId,
      botId: devTargetBotId,
    })
    expect(JSON.stringify(clientMocks.constructorOptions[0])).not.toContain(opaqueRuntimeBotId)
    expect(JSON.stringify(clientMocks.constructorOptions[0])).not.toContain(PROD_CONNECTION.token)
    expect(JSON.stringify(clientMocks.constructorOptions[0])).not.toContain(PROD_CONNECTION.workspaceId)
  })

  it.each([
    {
      label: 'another bot',
      botId: 'prod_bot',
      dev: false,
      scope: { environment: 'prod', botId: 'other_prod_bot' } as AssetsCacheScope,
    },
    {
      label: 'another environment',
      botId: 'prod_bot',
      dev: true,
      scope: PROD_SCOPE,
    },
  ])('rejects a cache scope for $label before network or artifact writes', async ({ botId, dev, scope }) => {
    clientMocks.listFiles.mockResolvedValue({ files: [] })

    await expect(
      generateAssetsRuntime(projectPath, botId, {
        dev,
        credentials: PROD_CONNECTION,
        cacheScope: scope,
        failOnRemoteFetchError: true,
      })
    ).rejects.toThrow(/asset.*scope|scope.*asset/i)

    expect(clientMocks.listFiles).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(projectPath, '.adk', 'assets-runtime.ts'))).toBe(false)
  })

  it('keeps first-session dev bootstrap separate and uses safe target filenames', async () => {
    const bootstrapScope: AssetsCacheScope = { environment: 'dev' }
    const unsafeBotScope: AssetsCacheScope = { environment: 'dev', botId: '../../prod-target' }
    await seedCache(projectPath, bootstrapScope, metadata('BOOTSTRAP_URL', 'bootstrap_file'))
    await seedCache(projectPath, unsafeBotScope, metadata('UNSAFE_BOT_URL', 'unsafe_bot_file'))

    expect((await cacheFor(projectPath, bootstrapScope).getEntry(ASSET_PATH))?.metadata.url).toBe('BOOTSTRAP_URL')
    expect((await cacheFor(projectPath, unsafeBotScope).getEntry(ASSET_PATH))?.metadata.url).toBe('UNSAFE_BOT_URL')
    expect(() => cacheFor(projectPath, { environment: 'prod' })).toThrow(/production.*bot id/i)

    const cacheFiles = fs.readdirSync(path.join(projectPath, '.adk', 'assets-cache', 'dev')).sort()
    expect(cacheFiles).toContain('bootstrap.json')
    expect(cacheFiles.some((name) => /^bot-[a-f0-9]{32}\.json$/.test(name))).toBe(true)
    expect(fs.existsSync(path.join(projectPath, 'prod-target.json'))).toBe(false)
  })
})
