import { describe, expect, it } from 'vitest'
import { DEV_TARGET_TAG, resolveDevBotTarget } from './dev-target'

const devBot = (overrides: Record<string, unknown> = {}) => ({
  id: 'tunnel-opaque',
  dev: true,
  tags: { [DEV_TARGET_TAG]: '42' },
  ...overrides,
})

describe('resolveDevBotTarget', () => {
  it('returns the positive numeric target while preserving the opaque runtime id', () => {
    expect(resolveDevBotTarget(devBot(), 'tunnel-opaque')).toEqual({
      runtimeBotId: 'tunnel-opaque',
      targetBotId: '42',
    })
  })

  it.each([
    ['missing tag', {}],
    ['zero', { [DEV_TARGET_TAG]: '0' }],
    ['negative', { [DEV_TARGET_TAG]: '-1' }],
    ['decimal', { [DEV_TARGET_TAG]: '1.5' }],
    ['leading zero', { [DEV_TARGET_TAG]: '042' }],
    ['opaque tunnel id', { [DEV_TARGET_TAG]: 'tunnel-opaque' }],
    ['non-string tag', { [DEV_TARGET_TAG]: 42 }],
  ])('fails loud for %s before a mutation can choose a target', (_name, tags) => {
    expect(() => resolveDevBotTarget(devBot({ tags }), 'tunnel-opaque')).toThrow(/dev target/i)
  })

  it('rejects a non-dev response', () => {
    expect(() => resolveDevBotTarget(devBot({ dev: false }), 'tunnel-opaque')).toThrow(/dev:true/i)
  })

  it('rejects a response for another opaque runtime id', () => {
    expect(() => resolveDevBotTarget(devBot({ id: 'another-tunnel' }), 'tunnel-opaque')).toThrow(/tunnel-opaque/)
  })

  it('rejects a changed target when a cached target is supplied', () => {
    expect(() => resolveDevBotTarget(devBot(), 'tunnel-opaque', '41')).toThrow(/41.*42|42.*41/)
  })
})
