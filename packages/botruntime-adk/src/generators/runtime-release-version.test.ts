import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageDirectory = fileURLToPath(new URL('../../', import.meta.url))
const repositoryPackagesDirectory = fileURLToPath(new URL('../../../', import.meta.url))

describe('ADK runtime release version', () => {
  it('injects the lockstep ADK/runtime release instead of an old dependency range floor', () => {
    const adkPackage = JSON.parse(readFileSync(`${packageDirectory}/package.json`, 'utf8')) as { version: string }
    const runtimePackage = JSON.parse(
      readFileSync(`${repositoryPackagesDirectory}/botruntime-runtime/package.json`, 'utf8')
    ) as { version: string }
    const buildSource = readFileSync(`${packageDirectory}/scripts/build.ts`, 'utf8')

    expect(adkPackage.version).toBe(runtimePackage.version)
    expect(buildSource).toContain('__RUNTIME_VERSION__: JSON.stringify(pkg.version)')
  })
})
