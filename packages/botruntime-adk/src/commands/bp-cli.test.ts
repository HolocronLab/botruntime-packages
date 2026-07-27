import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveBpCliBinPath } from './bp-cli.js'

describe('BRT package CLI resolution', () => {
  let installDir: string
  let packageDir: string

  beforeEach(() => {
    installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-brt-cli-'))
    packageDir = path.join(installDir, 'node_modules', '@holocronlab', 'brt')
    fs.mkdirSync(path.join(packageDir, 'src'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(installDir, { recursive: true, force: true })
  })

  it('resolves the executable declared by the installed package manifest', () => {
    const cliPath = path.join(packageDir, 'src', 'cli.ts')
    fs.writeFileSync(cliPath, '#!/usr/bin/env bun\n')
    writeManifest({ brt: 'src/cli.ts' })

    expect(resolveBpCliBinPath(installDir, '0.11.2')).toBe(fs.realpathSync(cliPath))
  })

  it('accepts the string form of package.json#bin', () => {
    const cliPath = path.join(packageDir, 'src', 'cli.ts')
    fs.writeFileSync(cliPath, '#!/usr/bin/env bun\n')
    writeManifest('src/cli.ts')

    expect(resolveBpCliBinPath(installDir, '0.11.2')).toBe(fs.realpathSync(cliPath))
  })

  it('rejects a stale package version instead of silently running it', () => {
    fs.writeFileSync(path.join(packageDir, 'src', 'cli.ts'), '#!/usr/bin/env bun\n')
    writeManifest({ brt: 'src/cli.ts' }, '0.11.1')

    expect(() => resolveBpCliBinPath(installDir, '0.11.2')).toThrow(/version 0\.11\.2.*installed correctly/)
  })

  it('rejects a package bin path that escapes the package directory', () => {
    writeManifest({ brt: '../../outside' })

    expect(() => resolveBpCliBinPath(installDir, '0.11.2')).toThrow(/installed correctly/)
  })

  it('rejects a declared executable symlink that resolves outside the package directory', () => {
    const outsidePath = path.join(installDir, 'outside.ts')
    fs.writeFileSync(outsidePath, '#!/usr/bin/env bun\n')
    fs.symlinkSync(outsidePath, path.join(packageDir, 'src', 'cli.ts'))
    writeManifest({ brt: 'src/cli.ts' })

    expect(() => resolveBpCliBinPath(installDir, '0.11.2')).toThrow(/installed correctly/)
  })

  it('rejects a missing declared executable', () => {
    writeManifest({ brt: 'src/missing.ts' })

    expect(() => resolveBpCliBinPath(installDir, '0.11.2')).toThrow(/installed correctly/)
  })

  function writeManifest(bin: string | Record<string, string>, version = '0.11.2'): void {
    fs.writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify({ name: '@holocronlab/brt', version, bin })
    )
  }
})
