import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as adkBundle from './adk-bundle'

describe('sha256', () => {
  it('hashes deterministically', () => {
    expect(adkBundle.sha256('hello')).toBe(adkBundle.sha256('hello'))
    expect(adkBundle.sha256('hello')).not.toBe(adkBundle.sha256('world'))
  })
})

describe('isAgentProject', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-adk-detect-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('is true when agent.config.ts is present', () => {
    fs.writeFileSync(path.join(dir, adkBundle.AGENT_CONFIG_FILE), 'export default {}')
    expect(adkBundle.isAgentProject(dir)).toBe(true)
  })

  it('is false when agent.config.ts is absent', () => {
    expect(adkBundle.isAgentProject(dir)).toBe(false)
  })
})

describe('buildRecurringEventsManifest', () => {
  it('returns no recurring events for manual workflows', () => {
    expect(
      adkBundle.buildRecurringEventsManifest({
        workflows: [{ definition: { name: 'manualDigest' } }],
      })
    ).toEqual({})
  })

  it('maps scheduled workflows to workflowSchedule events', () => {
    expect(
      adkBundle.buildRecurringEventsManifest({
        workflows: [{ definition: { name: 'Daily Digest', schedule: '0 9 * * *', input: { type: 'object' } } }],
      })
    ).toEqual({
      dailydigestschedule: {
        type: 'workflowSchedule',
        schedule: { cron: '0 9 * * *' },
        payload: { workflow: 'Daily Digest' },
      },
    })
  })

  it('rejects scheduled workflows whose input requires fields', () => {
    expect(() =>
      adkBundle.buildRecurringEventsManifest({
        workflows: [
          {
            definition: {
              name: 'dailyDigest',
              schedule: '0 9 * * *',
              input: { type: 'object', required: ['chatId'] },
            },
          },
        ],
      })
    ).toThrow(/dailyDigest.*input.*chatId/i)
  })
})

describe('isAgentSourceChange', () => {
  const dir = path.join(os.tmpdir(), 'brt-agent-source')

  it.each([
    adkBundle.AGENT_CONFIG_FILE,
    'package.json',
    'agent.json',
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    path.join('src', 'agent.ts'),
    path.join('src', 'knowledge', 'manual.md'),
    path.join('src', 'knowledge', 'terms.pdf'),
    path.join('src', 'assets', 'logo.png'),
    path.join('.adk', 'dependencies', 'dev.json'),
  ])('accepts the ADK watcher input %s', (relativePath) => {
    expect(adkBundle.isAgentSourceChange(dir, path.join(dir, relativePath), { dependencyEnv: 'dev' })).toBe(true)
  })

  it.each([
    'agent.local.json',
    'README.md',
    path.join('assets', 'logo.png'),
    path.join('tests', 'agent.test.ts'),
    path.join('evals', 'case.ts'),
    path.join('.adk', 'bot', 'index.ts'),
    path.join('.adk', 'dependencies', 'nested', 'state.json'),
    path.join('.brt', 'dist', 'index.cjs'),
    path.join('node_modules', 'dep', 'index.ts'),
    path.join('.git', 'config'),
  ])('rejects the non-input or generated path %s', (relativePath) => {
    expect(adkBundle.isAgentSourceChange(dir, path.join(dir, relativePath), { dependencyEnv: 'dev' })).toBe(false)
  })

  it('rejects paths outside the agent project', () => {
    expect(
      adkBundle.isAgentSourceChange(dir, path.join(dir, '..', 'outside.ts'), { dependencyEnv: 'dev' })
    ).toBe(false)
  })

  it('rejects root feedback markdown', () => {
    expect(
      adkBundle.isAgentSourceChange(dir, path.join(dir, 'feedback.md'), { dependencyEnv: 'dev' })
    ).toBe(false)
  })
})

describe('agentDependencySnapshotBuildFingerprint', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-adk-snapshot-fingerprint-'))
    fs.mkdirSync(path.join(dir, '.adk', 'dependencies'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const writeSnapshot = (overrides: Record<string, unknown> = {}) => {
    fs.writeFileSync(
      path.join(dir, '.adk', 'dependencies', 'dev.json'),
      JSON.stringify({
        version: 2,
        env: 'dev',
        target: { apiUrl: 'https://cloud.example', workspaceId: 'ws_1', botId: '42' },
        fetchedAt: '2030-01-01T00:00:00.000Z',
        botUpdatedAt: '2030-01-01T00:00:00.000Z',
        integrations: { chat: { name: 'botruntime/chat', version: '1.0.0' } },
        plugins: {},
        ...overrides,
      })
    )
  }

  it('ignores refresh timestamps but changes when dependency bindings change', () => {
    writeSnapshot()
    const initial = adkBundle.agentDependencySnapshotBuildFingerprint(dir, 'dev')

    writeSnapshot({
      fetchedAt: '2030-01-02T00:00:00.000Z',
      botUpdatedAt: '2030-01-02T00:00:00.000Z',
    })
    expect(adkBundle.agentDependencySnapshotBuildFingerprint(dir, 'dev')).toBe(initial)

    writeSnapshot({ integrations: { chat: { name: 'botruntime/chat', version: '1.1.0' } } })
    expect(adkBundle.agentDependencySnapshotBuildFingerprint(dir, 'dev')).not.toBe(initial)
  })
})

describe('normalizeBundle', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-adk-normalize-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('copies the generated bot bundle (.adk/bot/.botpress/dist/index.cjs) to .brt/dist/index.cjs', () => {
    const produced = path.join(dir, '.adk', 'bot', '.botpress', 'dist', 'index.cjs')
    fs.mkdirSync(path.dirname(produced), { recursive: true })
    fs.writeFileSync(produced, 'built-natively')

    const out = adkBundle.normalizeBundle(dir, { quiet: true })
    expect(out).toBe(path.join(dir, '.brt', 'dist', 'index.cjs'))
    expect(fs.readFileSync(out, 'utf8')).toBe('built-natively')
  })

  it('fails loud when no recognizable bundle was produced', () => {
    expect(() => adkBundle.normalizeBundle(dir, { quiet: true })).toThrow(/build produced no bundle/)
  })
})

describe('ensureBundle / requireExistingBundle', () => {
  let dir: string
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-adk-bundle-'))
    savedEnv['BRT_BUNDLE_PATH'] = process.env['BRT_BUNDLE_PATH']
    delete process.env['BRT_BUNDLE_PATH']
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    for (const key of Object.keys(savedEnv)) {
      const value = savedEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('BRT_BUNDLE_PATH short-circuits ensureBundle without invoking build', async () => {
    const overridePath = path.join(dir, 'custom.cjs')
    fs.writeFileSync(overridePath, 'module.exports = {}')
    process.env['BRT_BUNDLE_PATH'] = overridePath

    const build = async () => {
      throw new Error('build must not be called when BRT_BUNDLE_PATH is set')
    }
    await expect(adkBundle.ensureBundle(build)).resolves.toBe(overridePath)
    expect(adkBundle.requireExistingBundle(dir)).toBe(overridePath)
  })

  it('BRT_BUNDLE_PATH fails loud when the file is missing', () => {
    process.env['BRT_BUNDLE_PATH'] = path.join(dir, 'missing.cjs')
    expect(() => adkBundle.requireExistingBundle(dir)).toThrow(/BRT_BUNDLE_PATH.*readable regular file/)
  })

  it('requireExistingBundle fails loud when no bundle exists and no override is set', () => {
    expect(() => adkBundle.requireExistingBundle(dir)).toThrow(/--noBuild was set but no existing bundle/)
  })

  it('ensureBundle invokes build when no bundle exists and returns its result', async () => {
    const out = path.join(dir, '.brt', 'dist', 'index.cjs')
    let called = false
    const build = async () => {
      called = true
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, 'freshly-built')
      return out
    }
    await expect(adkBundle.ensureBundle(build)).resolves.toBe(out)
    expect(called).toBe(true)
    expect(adkBundle.requireExistingBundle(dir)).toBe(out)
  })

  // Regression (prod bug 2026-07-07): a plain `brt deploy --adk` reused a stale
  // .brt/dist/index.cjs and shipped old code under a new version. ensureBundle
  // must ALWAYS rebuild — never short-circuit on an existing artifact.
  it('ensureBundle always rebuilds even when a bundle already exists (no stale reuse)', async () => {
    const out = path.join(dir, '.brt', 'dist', 'index.cjs')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, 'stale')
    let called = false
    const build = async () => {
      called = true
      fs.writeFileSync(out, 'rebuilt')
      return out
    }
    await expect(adkBundle.ensureBundle(build)).resolves.toBe(out)
    expect(called).toBe(true)
    expect(fs.readFileSync(out, 'utf8')).toBe('rebuilt')
  })
})

describe('ADK bundle provenance', () => {
  let dir: string
  let bundlePath: string
  const target = {
    apiUrl: 'https://cloud.example/',
    workspaceId: 'ws_123',
    botId: '42',
  }
  const validHash = adkBundle.sha256('authoritative bundle')

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-adk-provenance-'))
    bundlePath = path.join(dir, '.brt', 'dist', 'index.cjs')
    fs.mkdirSync(path.dirname(bundlePath), { recursive: true })
    fs.writeFileSync(bundlePath, 'authoritative bundle')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('atomically writes the exact canonical non-secret sidecar', () => {
    const provenancePath = adkBundle.writeBundleProvenance(bundlePath, target)
    const parsed = JSON.parse(fs.readFileSync(provenancePath, 'utf8'))

    expect(provenancePath).toBe(`${bundlePath}.provenance.json`)
    expect(Object.keys(parsed)).toEqual(['schemaVersion', 'apiUrl', 'workspaceId', 'botId', 'sha256'])
    expect(parsed).toEqual({
      schemaVersion: 1,
      apiUrl: 'https://cloud.example',
      workspaceId: 'ws_123',
      botId: '42',
      sha256: adkBundle.sha256('authoritative bundle'),
    })
    expect(JSON.stringify(parsed)).not.toContain('token')
    expect(fs.readdirSync(path.dirname(bundlePath)).filter((name) => name.includes('.tmp-'))).toEqual([])
  })

  it('accepts only an exact target and exact current bundle hash', () => {
    adkBundle.writeBundleProvenance(bundlePath, target)

    expect(
      adkBundle.validateBundleProvenance(bundlePath, {
        apiUrl: 'https://cloud.example',
        workspaceId: 'ws_123',
        botId: '42',
      })
    ).toEqual({
      code: 'authoritative bundle',
      sha256: validHash,
      provenance: {
        schemaVersion: 1,
        apiUrl: 'https://cloud.example',
        workspaceId: 'ws_123',
        botId: '42',
        sha256: validHash,
      },
    })
  })

  it('returns the exact verified bytes so a later file change cannot alter the deploy payload', () => {
    adkBundle.writeBundleProvenance(bundlePath, target)
    const verified = adkBundle.validateBundleProvenance(bundlePath, target)

    fs.writeFileSync(bundlePath, 'raced replacement')

    expect(verified.code).toBe('authoritative bundle')
    expect(verified.sha256).toBe(validHash)
    expect(adkBundle.sha256(fs.readFileSync(bundlePath, 'utf8'))).not.toBe(verified.sha256)
  })

  it.each([
    ['missing sidecar', undefined],
    ['malformed JSON', '{'],
    ['null', 'null'],
    ['array', '[]'],
    [
      'extra key',
      { schemaVersion: 1, apiUrl: 'https://cloud.example', workspaceId: 'ws_123', botId: '42', sha256: validHash, extra: true },
    ],
    ['missing key', { schemaVersion: 1, apiUrl: 'https://cloud.example', workspaceId: 'ws_123', botId: '42' }],
    [
      'unknown schema',
      { schemaVersion: 2, apiUrl: 'https://cloud.example', workspaceId: 'ws_123', botId: '42', sha256: validHash },
    ],
    [
      'string schema',
      { schemaVersion: '1', apiUrl: 'https://cloud.example', workspaceId: 'ws_123', botId: '42', sha256: validHash },
    ],
    [
      'wrong field type',
      { schemaVersion: 1, apiUrl: 'https://cloud.example', workspaceId: 123, botId: '42', sha256: validHash },
    ],
    [
      'numeric bot id',
      { schemaVersion: 1, apiUrl: 'https://cloud.example', workspaceId: 'ws_123', botId: 42, sha256: validHash },
    ],
    [
      'empty field',
      { schemaVersion: 1, apiUrl: 'https://cloud.example', workspaceId: '', botId: '42', sha256: validHash },
    ],
    [
      'non-normalized apiUrl',
      { schemaVersion: 1, apiUrl: 'https://cloud.example/', workspaceId: 'ws_123', botId: '42', sha256: validHash },
    ],
    [
      'invalid hash shape',
      { schemaVersion: 1, apiUrl: 'https://cloud.example', workspaceId: 'ws_123', botId: '42', sha256: 'not-a-hash' },
    ],
    [
      'api mismatch',
      { schemaVersion: 1, apiUrl: 'https://other.example', workspaceId: 'ws_123', botId: '42', sha256: validHash },
    ],
    [
      'workspace mismatch',
      { schemaVersion: 1, apiUrl: 'https://cloud.example', workspaceId: 'other_ws', botId: '42', sha256: validHash },
    ],
    [
      'bot mismatch',
      { schemaVersion: 1, apiUrl: 'https://cloud.example', workspaceId: 'ws_123', botId: '99', sha256: validHash },
    ],
    [
      'bundle hash mismatch',
      { schemaVersion: 1, apiUrl: 'https://cloud.example', workspaceId: 'ws_123', botId: '42', sha256: 'a'.repeat(64) },
    ],
  ])('fails closed for %s with rebuild guidance', (_label, sidecar) => {
    const provenancePath = `${bundlePath}.provenance.json`
    if (typeof sidecar === 'string') fs.writeFileSync(provenancePath, sidecar)
    else if (sidecar !== undefined) fs.writeFileSync(provenancePath, JSON.stringify(sidecar))

    expect(() => adkBundle.validateBundleProvenance(bundlePath, target)).toThrow(/rebuild without --noBuild/i)
  })
})
