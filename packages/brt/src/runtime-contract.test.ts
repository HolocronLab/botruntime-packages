import { describe, expect, it } from 'vitest'
import { parseServerRuntimeContract } from './runtime-contract'

describe('server runtime contract', () => {
  it('classifies an absent additive contract as legacy/unknown', () => {
    expect(parseServerRuntimeContract(undefined)).toEqual({
      authority: 'unknown',
      reason: expect.stringMatching(/legacy/i),
    })
  })

  it('accepts the canonical authoritative capability contract', () => {
    expect(
      parseServerRuntimeContract({
        schemaVersion: 1,
        authority: 'cloudapi',
        source: 'bot-platform',
        capabilities: {
          evalManifest: 2,
          tableFixtures: 1,
          devTargetRouting: 1,
          traceProtocol: 1,
        },
      })
    ).toEqual({
      authority: 'authoritative',
      capabilities: {
        evalManifest: 2,
        tableFixtures: 1,
        devTargetRouting: 1,
        traceProtocol: 1,
      },
    })
  })

  it.each([
    [{}, /schemaVersion/],
    [{ schemaVersion: 2 }, /schemaVersion/],
    [{ schemaVersion: 1, authority: 'runtime', source: 'bot-platform' }, /authority=cloudapi/],
    [
      {
        schemaVersion: 1,
        authority: 'cloudapi',
        source: 'bot-platform',
        capabilities: { evalManifest: 0 },
      },
      /evalManifest.*positive integer/,
    ],
  ])('rejects a malformed present contract %#', (value, message) => {
    expect(() => parseServerRuntimeContract(value)).toThrow(message as RegExp)
  })
})
