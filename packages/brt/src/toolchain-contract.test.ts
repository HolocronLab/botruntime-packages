import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./errors', () => ({
  BotpressCLIError: class BotpressCLIError extends Error {
    static wrap(thrown: unknown, message: string): Error {
      return new Error(`${message}: ${String(thrown)}`)
    }
  },
}))
import {
  assertPlatformToolchainCompatible,
  inspectPlatformToolchain,
  validatePlatformToolchainArtifact,
  writePlatformToolchainContract,
} from './toolchain-contract'

const RUNTIME = '@holocronlab/botruntime-runtime'
const EVALS = '@holocronlab/botruntime-evals'

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function installPackage(
  projectDir: string,
  packageName: string,
  version: string,
  dependencies: Record<string, string> = {}
): string {
  const packageDir = path.join(projectDir, 'node_modules', ...packageName.split('/'))
  writeJson(path.join(packageDir, 'package.json'), {
    name: packageName,
    version,
    main: 'index.js',
    dependencies,
    ...(packageName === EVALS ? { botruntime: { capabilities: { evalManifest: 2 } } } : {}),
  })
  fs.writeFileSync(path.join(packageDir, 'index.js'), 'module.exports = {}')
  return packageDir
}

function writeFixture(projectDir: string, actualEvalsVersion: string, lockedEvalsVersion: string): void {
  writeJson(path.join(projectDir, 'package.json'), {
    name: 'test-agent',
    dependencies: { [RUNTIME]: '^2.1.19' },
  })
  installPackage(projectDir, RUNTIME, '2.1.19', { [EVALS]: '^2.1.9' })
  installPackage(projectDir, EVALS, actualEvalsVersion)
  fs.writeFileSync(
    path.join(projectDir, 'bun.lock'),
    JSON.stringify(
      {
        lockfileVersion: 1,
        workspaces: { '': { dependencies: { [RUNTIME]: '^2.1.19' } } },
        packages: {
          [RUNTIME]: [`${RUNTIME}@2.1.19`, '', { dependencies: { [EVALS]: '^2.1.9' } }],
          [`${RUNTIME}/${EVALS}`]: [`${EVALS}@${lockedEvalsVersion}`],
        },
      },
      null,
      2
    )
  )
}

describe('platform toolchain contract', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-toolchain-'))
  })

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  it('fails loudly when a runtime dependency resolves below both its declaration and lock', () => {
    writeFixture(projectDir, '2.1.8', '2.1.9')

    const contract = inspectPlatformToolchain(projectDir, {
      includeCliPackages: false,
    })

    expect(contract.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DECLARED_VERSION_MISMATCH',
          parent: RUNTIME,
          package: EVALS,
          declared: '^2.1.9',
          locked: '2.1.9',
          resolved: '2.1.8',
        }),
        expect.objectContaining({
          code: 'LOCK_VERSION_MISMATCH',
          parent: RUNTIME,
          package: EVALS,
          locked: '2.1.9',
          resolved: '2.1.8',
        }),
      ])
    )
    expect(() => assertPlatformToolchainCompatible(contract)).toThrow(
      /TOOLCHAIN_INCOMPATIBLE[\s\S]*botruntime-runtime[\s\S]*botruntime-evals[\s\S]*2\.1\.9[\s\S]*2\.1\.8/
    )
  })

  it('accepts a graph whose declared, locked, and physical versions agree', () => {
    writeFixture(projectDir, '2.1.9', '2.1.9')

    const contract = inspectPlatformToolchain(projectDir, {
      includeCliPackages: false,
    })

    expect(contract.issues).toEqual([])
    expect(contract.capabilities).toEqual({ evalManifest: 2 })
    expect(contract.packages).toEqual([
      expect.objectContaining({ name: EVALS, version: '2.1.9' }),
      expect.objectContaining({ name: RUNTIME, version: '2.1.19' }),
    ])
    expect(() => assertPlatformToolchainCompatible(contract)).not.toThrow()
  })

  it('writes a deterministic non-secret contract artifact with lock hash and realpaths', () => {
    writeFixture(projectDir, '2.1.9', '2.1.9')
    const contract = inspectPlatformToolchain(projectDir, {
      includeCliPackages: false,
    })

    const artifactPath = writePlatformToolchainContract(projectDir, contract)
    const first = fs.readFileSync(artifactPath, 'utf8')
    const secondPath = writePlatformToolchainContract(projectDir, contract)

    expect(artifactPath).toBe(path.join(projectDir, '.brt', 'toolchain-contract.json'))
    expect(secondPath).toBe(artifactPath)
    expect(fs.readFileSync(secondPath, 'utf8')).toBe(first)
    expect(JSON.parse(first)).toMatchObject({
      schemaVersion: 1,
      capabilities: { evalManifest: 2 },
      lockfile: {
        name: 'bun.lock',
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      packages: [
        {
          name: EVALS,
          version: '2.1.9',
          realpath: expect.stringContaining('node_modules'),
        },
        {
          name: RUNTIME,
          version: '2.1.19',
          realpath: expect.stringContaining('node_modules'),
        },
      ],
      issues: [],
    })
    expect(first).not.toMatch(/token|secret/i)
  })

  it('rejects a no-build artifact after either the lockfile or bundle bytes change', () => {
    writeFixture(projectDir, '2.1.9', '2.1.9')
    const contract = inspectPlatformToolchain(projectDir, {
      includeCliPackages: false,
    })
    writePlatformToolchainContract(projectDir, contract, {
      bundleSha256: 'a'.repeat(64),
    })

    expect(() => validatePlatformToolchainArtifact(projectDir, contract, 'b'.repeat(64))).toThrow(/bundle sha-256/i)

    fs.appendFileSync(path.join(projectDir, 'bun.lock'), '\n')
    const changed = inspectPlatformToolchain(projectDir, {
      includeCliPackages: false,
    })
    expect(() => validatePlatformToolchainArtifact(projectDir, changed, 'a'.repeat(64))).toThrow(/lockfile|toolchain/i)
  })
})
