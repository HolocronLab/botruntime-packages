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

describe('ensureBundle / buildBundle / requireExistingBundle', () => {
  let dir: string
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-adk-bundle-'))
    savedEnv['BRT_SDK_BUILD'] = process.env['BRT_SDK_BUILD']
    savedEnv['BRT_BUNDLE_PATH'] = process.env['BRT_BUNDLE_PATH']
    savedEnv['PATH'] = process.env['PATH']
    delete process.env['BRT_SDK_BUILD']
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

  it('BRT_BUNDLE_PATH short-circuits both ensureBundle and requireExistingBundle', async () => {
    const overridePath = path.join(dir, 'custom.cjs')
    fs.writeFileSync(overridePath, 'module.exports = {}')
    process.env['BRT_BUNDLE_PATH'] = overridePath

    await expect(adkBundle.ensureBundle(dir, true)).resolves.toBe(overridePath)
    expect(adkBundle.requireExistingBundle(dir)).toBe(overridePath)
  })

  it('BRT_BUNDLE_PATH fails loud when the file is missing', () => {
    process.env['BRT_BUNDLE_PATH'] = path.join(dir, 'missing.cjs')
    expect(() => adkBundle.requireExistingBundle(dir)).toThrow(/BRT_BUNDLE_PATH is set but the file is missing/)
  })

  it('requireExistingBundle fails loud when no bundle exists and no override is set', () => {
    expect(() => adkBundle.requireExistingBundle(dir)).toThrow(/--noBuild was set but no existing bundle/)
  })

  it('ensureBundle reuses an existing bundle without rebuilding when force is false', async () => {
    const out = path.join(dir, '.brt', 'dist', 'index.cjs')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, 'existing')
    // No BRT_SDK_BUILD set: if this tried to rebuild it would fail loud (no SDK
    // binary found), proving the existing bundle was reused instead.
    await expect(adkBundle.ensureBundle(dir, false)).resolves.toBe(out)
    expect(fs.readFileSync(out, 'utf8')).toBe('existing')
  })

  it('runs BRT_SDK_BUILD, copies the produced artifact to .brt/dist/index.cjs, and requireExistingBundle then finds it', async () => {
    // A fixture "SDK toolchain": drops a bundle at dist/index.cjs when invoked as `<node> fixture-build.js build`.
    const fixtureBuildScript = path.join(dir, 'fixture-build.js')
    fs.writeFileSync(
      fixtureBuildScript,
      "const fs=require('fs');const path=require('path');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync(path.join('dist','index.cjs'),'built-by-fixture')"
    )
    process.env['BRT_SDK_BUILD'] = `${process.execPath} ${fixtureBuildScript}`

    const out = await adkBundle.ensureBundle(dir, false)
    expect(out).toBe(path.join(dir, '.brt', 'dist', 'index.cjs'))
    expect(fs.readFileSync(out, 'utf8')).toBe('built-by-fixture')
    expect(adkBundle.requireExistingBundle(dir)).toBe(out)
  })

  it('fails loud with a non-zero exit from the build command', async () => {
    const fixtureBuildScript = path.join(dir, 'failing-build.js')
    fs.writeFileSync(fixtureBuildScript, 'process.exit(3)')
    process.env['BRT_SDK_BUILD'] = `${process.execPath} ${fixtureBuildScript}`

    await expect(adkBundle.buildBundle(dir, { quiet: true })).rejects.toThrow(/SDK build failed \(exit 3\)/)
  })

  it('fails loud when the build produces no recognizable bundle', async () => {
    const fixtureBuildScript = path.join(dir, 'noop-build.js')
    fs.writeFileSync(fixtureBuildScript, '// does nothing')
    process.env['BRT_SDK_BUILD'] = `${process.execPath} ${fixtureBuildScript}`

    await expect(adkBundle.buildBundle(dir, { quiet: true })).rejects.toThrow(/build produced no bundle/)
  })

  it('fails loud when no SDK build command can be found', async () => {
    process.env['PATH'] = ''
    await expect(adkBundle.buildBundle(dir, { quiet: true })).rejects.toThrow(/no SDK build command found/)
  })
})
