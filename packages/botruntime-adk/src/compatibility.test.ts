import semver from 'semver'
import { describe, expect, it } from 'vitest'
import brtPackage from '../../brt/package.json'
import adkPackage from '../package.json'
import { BRT_COMPATIBILITY_RANGE } from './compatibility'

describe('BRT compatibility contract', () => {
  it('accepts the repository CLI release', () => {
    expect(semver.satisfies(brtPackage.version, BRT_COMPATIBILITY_RANGE)).toBe(true)
  })

  it('rejects the pre-canonical-config 0.6 release line', () => {
    expect(semver.satisfies('0.6.31', BRT_COMPATIBILITY_RANGE)).toBe(false)
  })

  it('does not silently accept the next CLI compatibility line', () => {
    expect(semver.satisfies('0.10.0', BRT_COMPATIBILITY_RANGE)).toBe(false)
  })

  it('does not create a runtime dependency cycle with the CLI that loads ADK', () => {
    expect(adkPackage.dependencies).not.toHaveProperty('@holocronlab/brt')
  })
})
