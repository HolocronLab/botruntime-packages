import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
    expect(() => adkBundle.requireExistingBundle(dir)).toThrow(/BRT_BUNDLE_PATH is set but the file is missing/)
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
