import semver from 'semver'
import { describe, expect, it } from 'vitest'
import brtPackage from '../../brt/package.json'
import adkPackage from '../package.json'
import { BRT_COMPATIBILITY_RANGE } from './compatibility'

describe('BRT compatibility contract', () => {
  it('accepts the repository CLI release', () => {
    expect(semver.satisfies(brtPackage.version, BRT_COMPATIBILITY_RANGE)).toBe(true)
  })

  it('rejects the known incompatible 0.5.4 layout', () => {
    expect(semver.satisfies('0.5.4', BRT_COMPATIBILITY_RANGE)).toBe(false)
  })

  it('does not create a runtime dependency cycle with the CLI that loads ADK', () => {
    expect(adkPackage.dependencies).not.toHaveProperty('@holocronlab/brt')
  })
})
