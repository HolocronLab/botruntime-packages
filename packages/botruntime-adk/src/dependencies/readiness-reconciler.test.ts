import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DependencySnapshotData, DependencySnapshotTarget } from './types.js'
import {
  reconcileDependencyReadiness,
  type CloudDependencyReadiness,
  type DependencyReadinessIssueCode,
} from './readiness-reconciler.js'
import { bpModuleDirName } from '../utils/ids.js'

const BOT_REVISION = '2026-07-10T00:00:00.000Z'
const EXPECTED_TARGET = {
  env: 'dev',
  apiUrl: 'https://authority.example',
  workspaceId: 'workspace_exact',
  botId: '42',
} satisfies DependencySnapshotTarget

function snapshot(): DependencySnapshotData {
  return {
    version: 2,
    env: 'dev',
    target: {
      apiUrl: 'https://authority.example',
      workspaceId: 'workspace_exact',
      botId: '42',
    },
    fetchedAt: '2026-07-10T00:00:01.000Z',
    botUpdatedAt: BOT_REVISION,
    integrations: {
      telegram: {
        name: 'telegram',
        version: '1.0.0',
        enabled: true,
        config: {},
        configurationType: 'default',
        configurationRevision: 'cfg-1',
        cloudId: '17',
      },
    },
    plugins: {},
  }
}

function cloud(): CloudDependencyReadiness {
  return {
    botUpdatedAt: BOT_REVISION,
    integrations: {
      authority: 'authoritative',
      source: 'integration_installation',
      items: {
        telegram: {
          id: '17',
          installationId: '91',
          name: 'telegram',
          version: '1.0.0',
          enabled: true,
          configurationType: 'default',
          configurationRevision: 'cfg-1',
          status: 'registered',
          statusReason: '',
        },
      },
    },
    plugins: { authority: 'unknown', reason: 'plugin_installations_not_persisted' },
    lastDevDeployment: { authority: 'unknown', reason: 'successful_dev_deployments_not_persisted' },
  }
}

function writeModule(
  bpModulesDir: string,
  kind: 'integration' | 'plugin',
  alias: string,
  name: string,
  version: string,
  metadata: Partial<{ type: string; id: string; name: string; version: string }> = {}
): string {
  const moduleDir = path.join(bpModulesDir, bpModuleDirName(kind, alias))
  fs.mkdirSync(moduleDir, { recursive: true })
  const values = { type: kind, id: kind === 'integration' ? '17' : '31', name, version, ...metadata }
  fs.writeFileSync(
    path.join(moduleDir, 'index.ts'),
    `export default {\n  type: ${JSON.stringify(values.type)},\n  name: ${JSON.stringify(values.name)},\n  version: ${JSON.stringify(values.version)},\n}\n`
      .replace(`\n  name:`, `\n  id: ${JSON.stringify(values.id)},\n  name:`)
  )
  return moduleDir
}

function issueCodes(report: Awaited<ReturnType<typeof reconcileDependencyReadiness>>): DependencyReadinessIssueCode[] {
  return report.issues.map((issue) => issue.code)
}

describe('reconcileDependencyReadiness', () => {
  let projectDir: string
  let bpModulesDir: string

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-readiness-'))
    bpModulesDir = path.join(projectDir, '.adk', 'bot', 'bp_modules')
    writeModule(bpModulesDir, 'integration', 'telegram', 'telegram', '1.0.0')
  })

  afterEach(() => fs.rmSync(projectDir, { recursive: true, force: true }))

  it('is green only when target, snapshot, generated modules and Cloud are fully aligned', async () => {
    const report = await reconcileDependencyReadiness({
      snapshot: snapshot(),
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: cloud(),
    })

    expect(report).toMatchObject({
      ok: true,
      issues: [],
      statuses: [
        {
          type: 'integration',
          alias: 'telegram',
          name: 'telegram',
          version: '1.0.0',
          enabled: true,
          state: 'available',
        },
      ],
    })
  })

  it.each([
    ['env', (value: any) => (value.env = 'prod'), 'SNAPSHOT_ENV_MISMATCH'],
    ['stale marker', (value: any) => (value.stale = true), 'SNAPSHOT_STALE'],
    ['bot target', (value: any) => (value.target.botId = '41'), 'SNAPSHOT_TARGET_MISMATCH'],
    [
      'API authority with the same env and bot',
      (value: any) => (value.target.apiUrl = 'https://foreign.example'),
      'SNAPSHOT_TARGET_MISMATCH',
    ],
    [
      'workspace authority with the same env and bot',
      (value: any) => (value.target.workspaceId = 'workspace_foreign'),
      'SNAPSHOT_TARGET_MISMATCH',
    ],
  ] as const)('blocks snapshot %s drift', async (_label, mutate, code) => {
    const value = snapshot()
    mutate(value)

    const report = await reconcileDependencyReadiness({
      snapshot: value,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: cloud(),
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain(code)
  })

  it('treats trailing API slashes as the same authority', async () => {
    const report = await reconcileDependencyReadiness({
      snapshot: snapshot(),
      expectedTarget: { ...EXPECTED_TARGET, apiUrl: 'https://authority.example///' },
      bpModulesDir,
      cloud: cloud(),
    })

    expect(report.ok).toBe(true)
    expect(report.issues).toEqual([])
  })

  it.each([
    ['a forged v1 snapshot', (value: any) => (value.version = 1)],
    ['a persisted non-canonical API URL', (value: any) => (value.target.apiUrl += '/')],
    ['a corrupt target', (value: any) => delete value.target.workspaceId],
  ] as const)('rejects %s before consuming dependency state', async (_label, mutate) => {
    const value = snapshot() as any
    mutate(value)

    await expect(
      reconcileDependencyReadiness({
        snapshot: value,
        expectedTarget: EXPECTED_TARGET,
        bpModulesDir,
        cloud: cloud(),
      })
    ).rejects.toThrow()
  })

  it('uses schema-parsed default maps instead of the unparsed input object', async () => {
    fs.rmSync(path.join(bpModulesDir, 'integration_telegram'), { recursive: true, force: true })
    const report = await reconcileDependencyReadiness({
      snapshot: {
        version: 2,
        env: 'dev',
        target: { ...snapshot().target },
        fetchedAt: '2026-07-10T00:00:01.000Z',
      } as any,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: {
        integrations: { authority: 'authoritative', source: 'integration_installation', items: {} },
        plugins: { authority: 'authoritative', source: 'bot_definition_plugins', items: {} },
      },
    })

    expect(report).toMatchObject({ ok: true, statuses: [], issues: [] })
  })

  it.each([
    ['missing directory', () => fs.rmSync(path.join(bpModulesDir, 'integration_telegram'), { recursive: true }), 'MODULE_MISSING'],
    [
      'missing package metadata',
      () => fs.rmSync(path.join(bpModulesDir, 'integration_telegram', 'index.ts')),
      'MODULE_METADATA_MISSING',
    ],
    [
      'kind drift',
      () => writeModule(bpModulesDir, 'integration', 'telegram', 'telegram', '1.0.0', { type: 'plugin' }),
      'MODULE_KIND_MISMATCH',
    ],
    [
      'name drift',
      () => writeModule(bpModulesDir, 'integration', 'telegram', 'wrong', '1.0.0'),
      'MODULE_NAME_MISMATCH',
    ],
    [
      'version drift',
      () => writeModule(bpModulesDir, 'integration', 'telegram', 'telegram', '2.0.0'),
      'MODULE_VERSION_MISMATCH',
    ],
    [
      'definition id drift',
      () => writeModule(bpModulesDir, 'integration', 'telegram', 'telegram', '1.0.0', { id: '999' }),
      'MODULE_ID_MISMATCH',
    ],
    [
      'missing definition id',
      () => {
        const moduleDir = writeModule(bpModulesDir, 'integration', 'telegram', 'telegram', '1.0.0')
        const modulePath = path.join(moduleDir, 'index.ts')
        fs.writeFileSync(modulePath, fs.readFileSync(modulePath, 'utf8').replace(/^\s*id:.*\n/m, ''))
      },
      'MODULE_ID_MISSING',
    ],
  ] as const)('blocks generated module %s', async (_label, mutate, code) => {
    mutate()

    const report = await reconcileDependencyReadiness({
      snapshot: snapshot(),
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: cloud(),
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain(code)
  })

  it('blocks an unexpected generated dependency module', async () => {
    writeModule(bpModulesDir, 'integration', 'orphan', 'orphan', '1.0.0')

    const report = await reconcileDependencyReadiness({
      snapshot: snapshot(),
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: cloud(),
    })

    expect(issueCodes(report)).toContain('MODULE_UNEXPECTED')
  })

  it('blocks two snapshot aliases that claim the same Cloud alias', async () => {
    const value = snapshot()
    value.integrations.secondary = {
      ...value.integrations.telegram,
      cloudAlias: 'telegram',
    }
    writeModule(bpModulesDir, 'integration', 'secondary', 'telegram', '1.0.0')

    const report = await reconcileDependencyReadiness({
      snapshot: value,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: cloud(),
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain('SNAPSHOT_CLOUD_ALIAS_DUPLICATE')
  })

  it('blocks aliases that normalize to the same generated module path', async () => {
    const value = snapshot()
    value.integrations = {
      'telegram-one': {
        ...value.integrations.telegram,
        cloudAlias: 'telegram-one',
      },
      telegram_one: {
        ...value.integrations.telegram,
        cloudAlias: 'telegram_one',
      },
    }
    fs.rmSync(bpModulesDir, { recursive: true })
    writeModule(bpModulesDir, 'integration', 'telegram-one', 'telegram', '1.0.0')
    const cloudValue = cloud()
    cloudValue.integrations!.items = {
      'telegram-one': { ...cloudValue.integrations!.items.telegram },
      telegram_one: { ...cloudValue.integrations!.items.telegram },
    }

    const report = await reconcileDependencyReadiness({
      snapshot: value,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: cloudValue,
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain('MODULE_PATH_COLLISION')
  })

  it('blocks missing bp_modules inventory even when the snapshot has no dependencies', async () => {
    const empty = snapshot()
    empty.integrations = {}
    fs.rmSync(bpModulesDir, { recursive: true })

    const report = await reconcileDependencyReadiness({
      snapshot: empty,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: {
        ...cloud(),
        integrations: { authority: 'authoritative', source: 'integration_installation', items: {} },
      },
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain('MODULE_INVENTORY_MISSING')
  })

  it.each([
    ['name', (value: any) => (value.integrations.items.telegram.name = 'wrong'), 'CLOUD_NAME_MISMATCH'],
    ['version', (value: any) => (value.integrations.items.telegram.version = '2.0.0'), 'CLOUD_VERSION_MISMATCH'],
    [
      'configuration type',
      (value: any) => (value.integrations.items.telegram.configurationType = 'oauth'),
      'CLOUD_CONFIGURATION_TYPE_MISMATCH',
    ],
    ['enabled', (value: any) => (value.integrations.items.telegram.enabled = false), 'CLOUD_ENABLED_MISMATCH'],
    [
      'configuration revision',
      (value: any) => (value.integrations.items.telegram.configurationRevision = 'cfg-2'),
      'CLOUD_CONFIGURATION_REVISION_MISMATCH',
    ],
    ['lifecycle', (value: any) => (value.integrations.items.telegram.status = 'pending'), 'CLOUD_LIFECYCLE_NOT_READY'],
  ] as const)('blocks Cloud integration %s drift', async (_label, mutate, code) => {
    const value = cloud()
    mutate(value)

    const report = await reconcileDependencyReadiness({
      snapshot: snapshot(),
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: value,
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain(code)
  })

  it('does not accept legacy active as a ready integration lifecycle', async () => {
    const value = cloud()
    value.integrations!.items.telegram.status = 'active'

    const report = await reconcileDependencyReadiness({
      snapshot: snapshot(),
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: value,
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain('CLOUD_LIFECYCLE_NOT_READY')
  })

  it('blocks a legacy snapshot that lacks the integration definition cloudId', async () => {
    const value = snapshot()
    delete value.integrations.telegram.cloudId

    const report = await reconcileDependencyReadiness({
      snapshot: value,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: cloud(),
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain('SNAPSHOT_CLOUD_ID_MISSING')
  })

  it('blocks missing and cloud-only integration aliases, including a disabled cloud-only alias', async () => {
    const missing = cloud()
    delete missing.integrations!.items.telegram
    const missingReport = await reconcileDependencyReadiness({
      snapshot: snapshot(),
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: missing,
    })
    expect(issueCodes(missingReport)).toContain('CLOUD_DEPENDENCY_MISSING')

    const extra = cloud()
    extra.integrations!.items.orphan = {
      name: 'orphan',
      version: '1.0.0',
      enabled: false,
      configurationType: 'default',
      configurationRevision: 'cfg-orphan',
      status: 'pending',
    }
    const extraReport = await reconcileDependencyReadiness({
      snapshot: snapshot(),
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: extra,
    })
    expect(issueCodes(extraReport)).toContain('CLOUD_DEPENDENCY_UNEXPECTED')
  })

  it.each([
    ['missing definition id', (value: any) => delete value.integrations.items.telegram.id, 'CLOUD_ID_MISSING'],
    ['definition id drift', (value: any) => (value.integrations.items.telegram.id = '18'), 'CLOUD_ID_MISMATCH'],
    [
      'missing installation id',
      (value: any) => delete value.integrations.items.telegram.installationId,
      'CLOUD_INSTALLATION_ID_MISSING',
    ],
  ] as const)('blocks Cloud integration %s', async (_label, mutate, code) => {
    const value = cloud()
    mutate(value)

    const report = await reconcileDependencyReadiness({
      snapshot: snapshot(),
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: value,
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain(code)
  })

  it('allows an exact intentionally disabled integration but blocks disabled-unconfigured state', async () => {
    const disabledSnapshot = snapshot()
    disabledSnapshot.integrations.telegram!.enabled = false
    const disabledCloud = cloud()
    disabledCloud.integrations!.items.telegram!.enabled = false
    disabledCloud.integrations!.items.telegram!.status = 'pending'

    const disabled = await reconcileDependencyReadiness({
      snapshot: disabledSnapshot,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: disabledCloud,
    })
    expect(disabled.ok).toBe(true)
    expect(disabled.statuses[0]).toMatchObject({ state: 'disabled', enabled: false })

    disabledSnapshot.integrations.telegram!.missingFields = ['botToken']
    const unconfigured = await reconcileDependencyReadiness({
      snapshot: disabledSnapshot,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: disabledCloud,
    })
    expect(unconfigured.ok).toBe(false)
    expect(unconfigured.statuses[0]).toMatchObject({ state: 'unconfigured', missingFields: ['botToken'] })
  })

  it('blocks enabled plugin lifecycle unknown but allows an exact explicitly disabled plugin', async () => {
    const pluginSnapshot = snapshot()
    pluginSnapshot.integrations = {}
    pluginSnapshot.plugins = {
      crm: { name: 'crm', version: '1.0.0', enabled: true, config: {}, dependencies: {} },
    }
    fs.rmSync(path.join(bpModulesDir, 'integration_telegram'), { recursive: true })
    writeModule(bpModulesDir, 'plugin', 'crm', 'crm', '1.0.0')
    const pluginCloud: CloudDependencyReadiness = {
      botUpdatedAt: BOT_REVISION,
      integrations: { authority: 'authoritative', source: 'integration_installation', items: {} },
      plugins: { authority: 'unknown', reason: 'plugin_installations_not_persisted' },
      lastDevDeployment: { authority: 'unknown', reason: 'successful_dev_deployments_not_persisted' },
    }

    const enabled = await reconcileDependencyReadiness({
      snapshot: pluginSnapshot,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: pluginCloud,
    })
    expect(enabled.ok).toBe(false)
    expect(issueCodes(enabled)).toContain('PLUGIN_CLOUD_STATE_UNKNOWN')

    pluginSnapshot.plugins.crm!.enabled = false
    const disabled = await reconcileDependencyReadiness({
      snapshot: pluginSnapshot,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: pluginCloud,
    })
    expect(disabled.ok).toBe(true)
    expect(disabled.statuses[0]).toMatchObject({ type: 'plugin', state: 'disabled' })
  })

  it('blocks duplicate disabled plugin cloudAlias even while plugin Cloud authority is unknown', async () => {
    const value = snapshot()
    value.integrations = {}
    value.plugins = {
      crm: {
        name: 'crm',
        version: '1.0.0',
        enabled: false,
        config: {},
        dependencies: {},
        cloudAlias: 'shared',
        cloudId: '31',
      },
      sales: {
        name: 'sales',
        version: '1.0.0',
        enabled: false,
        config: {},
        dependencies: {},
        cloudAlias: 'shared',
        cloudId: '32',
      },
    }
    fs.rmSync(bpModulesDir, { recursive: true })
    writeModule(bpModulesDir, 'plugin', 'crm', 'crm', '1.0.0', { id: '31' })
    writeModule(bpModulesDir, 'plugin', 'sales', 'sales', '1.0.0', { id: '32' })

    const report = await reconcileDependencyReadiness({
      snapshot: value,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: {
        integrations: { authority: 'authoritative', source: 'integration_installation', items: {} },
        plugins: { authority: 'unknown', reason: 'plugin_installations_not_persisted' },
        lastDevDeployment: { authority: 'unknown', reason: 'successful_dev_deployments_not_persisted' },
      },
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain('SNAPSHOT_CLOUD_ALIAS_DUPLICATE')
  })

  it('blocks a disabled plugin whose generated package id differs from its persisted cloudId', async () => {
    const value = snapshot()
    value.integrations = {}
    value.plugins = {
      crm: {
        name: 'crm',
        version: '1.0.0',
        enabled: false,
        config: {},
        dependencies: {},
        cloudId: '31',
      },
    }
    fs.rmSync(bpModulesDir, { recursive: true })
    writeModule(bpModulesDir, 'plugin', 'crm', 'crm', '1.0.0', { id: '999' })

    const report = await reconcileDependencyReadiness({
      snapshot: value,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: {
        integrations: { authority: 'authoritative', source: 'integration_installation', items: {} },
        plugins: { authority: 'unknown', reason: 'plugin_installations_not_persisted' },
        lastDevDeployment: { authority: 'unknown', reason: 'successful_dev_deployments_not_persisted' },
      },
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain('MODULE_ID_MISMATCH')
  })

  it('blocks an enabled plugin when its backing integration is intentionally disabled', async () => {
    const value = snapshot()
    value.integrations.telegram!.enabled = false
    value.plugins = {
      crm: {
        name: 'crm',
        version: '1.0.0',
        enabled: true,
        config: {},
        dependencies: { transport: { integrationAlias: 'telegram' } },
      },
    }
    writeModule(bpModulesDir, 'plugin', 'crm', 'crm', '1.0.0')
    const cloudValue = cloud()
    cloudValue.integrations!.items.telegram!.enabled = false
    cloudValue.integrations!.items.telegram!.status = 'pending'
    cloudValue.plugins = {
      authority: 'authoritative',
      source: 'bot_definition_plugins',
      items: { crm: { name: 'crm', version: '1.0.0', enabled: true, status: 'active' } },
    }

    const report = await reconcileDependencyReadiness({
      snapshot: value,
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: cloudValue,
    })

    expect(report.ok).toBe(false)
    expect(report.statuses.find((status) => status.type === 'plugin')).toMatchObject({
      state: 'unresolved',
      reason: expect.stringContaining('telegram'),
    })
  })

  it('fails closed on a partial Cloud response', async () => {
    const partial = cloud()
    delete partial.integrations

    const report = await reconcileDependencyReadiness({
      snapshot: snapshot(),
      expectedTarget: EXPECTED_TARGET,
      bpModulesDir,
      cloud: partial,
    })

    expect(report.ok).toBe(false)
    expect(issueCodes(report)).toContain('CLOUD_RESPONSE_PARTIAL')
  })
})
