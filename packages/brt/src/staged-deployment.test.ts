import { describe, expect, it, vi } from 'vitest'

import * as errors from './errors'
import {
  deploymentIdentity,
  runStagedDeployment,
  stateCodecDigest,
  type StagedDeploymentClient,
} from './staged-deployment'

const input = {
  botId: 'bot-1',
  workspaceId: 'ws-1',
  name: 'lawyer',
  code: 'module.exports = {}',
  contentHash: 'abc123',
  definition: { commands: [], recurringEvents: {} },
  tables: [
    {
      name: 'Claims',
      schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
      keyColumn: 'key',
      keyColumnUnique: true,
    },
  ],
  tableContractChanged: true,
  stateCodecDigest: 'codec-v1',
}

function deployment(phase: string, extra: Record<string, unknown> = {}) {
  return {
    id: deploymentIdentity(input).deploymentId,
    phase,
    transitionMode: 'fence',
    expectedCurrentVersionId: 10,
    stagedVersionId: 11,
    finalVersionId: 11,
    targetTableContracts: {},
    schemaMutated: phase === 'schema_synced',
    ...extra,
  }
}

function fakeClient(overrides: Partial<StagedDeploymentClient> = {}): StagedDeploymentClient {
  return {
    getDeploymentEnvironment: vi.fn().mockResolvedValue({
      environment: {
        runtimeId: 1,
        currentVersionId: 10,
        currentContentHash: 'abc123',
        fenceGeneration: 4,
        trafficFenced: false,
        enforcementState: 'enforced',
        pinDualWriteStartedAt: '2026-07-26T00:00:00Z',
        readiness: {
          activeManifestValid: true,
          newAdmissionUnpinnedRows: 0,
          legacyNonterminalUnclassified: 0,
          unknownExecutionDomains: 0,
          ready: true,
        },
      },
    }),
    bootstrapDeploymentEnvironment: vi.fn(),
    enforceDeploymentEnvironment: vi.fn(),
    getBotDeployment: vi.fn().mockRejectedValue(new errors.HTTPError(404, 'not found')),
    stageBotDeployment: vi.fn().mockResolvedValue({ deployment: deployment('staged') }),
    setBotDeploymentFence: vi
      .fn()
      .mockResolvedValue({ deployment: deployment('fenced', { fenceGeneration: 5 }) }),
    getBotDeploymentDrain: vi.fn().mockResolvedValue({
      drain: { beforeVersionId: 10, fenceGeneration: 5, counts: {}, unitIds: [], drained: true },
    }),
    syncBotDeploymentSchema: vi.fn().mockResolvedValue({ deployment: deployment('schema_synced') }),
    activateBotDeployment: vi.fn().mockResolvedValue({ deployment: deployment('activated') }),
    ...overrides,
  }
}

describe('staged deployment orchestration', () => {
  it('derives a stable identity independent of object key order', () => {
    expect(deploymentIdentity(input)).toEqual(
      deploymentIdentity({
        ...input,
        definition: { recurringEvents: {}, commands: [] },
      })
    )
  })

  it('derives codec compatibility from durable definitions, not generation time or table schema', () => {
    const base = {
      schemaVersion: 1,
      generatedAt: 'first',
      agent: { configuration: { schema: { type: 'object' } } },
      primitives: {
        workflows: [{ definition: { name: 'claim', state: { type: 'object' } } }],
        tables: [{ definition: { name: 'Claims', schema: { type: 'string' } } }],
      },
    }
    const changedOnlyOutsideCodec = {
      ...base,
      generatedAt: 'second',
      primitives: {
        ...base.primitives,
        tables: [{ definition: { name: 'ClaimsV2', schema: { type: 'number' } } }],
      },
    }
    const changedState = {
      ...base,
      primitives: {
        ...base.primitives,
        workflows: [{ definition: { name: 'claim', state: { type: 'string' } } }],
      },
    }

    expect(stateCodecDigest(base)).toBe(stateCodecDigest(changedOnlyOutsideCodec))
    expect(stateCodecDigest(base)).not.toBe(stateCodecDigest(changedState))
  })

  it('stages, fences, drains, synchronizes and activates in order', async () => {
    const client = fakeClient()

    await expect(runStagedDeployment(client, input, { sleep: vi.fn() })).resolves.toMatchObject({
      phase: 'activated',
    })

    expect(client.stageBotDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedCurrentVersionId: 10,
        transitionMode: 'fence',
        tables: input.tables,
        idempotencyKey: expect.stringMatching(/^brt-staged-/),
      })
    )
    expect(client.setBotDeploymentFence).toHaveBeenCalledWith(
      expect.objectContaining({ expectedFenceGeneration: 4, enabled: true })
    )
    const drainOrder = (client.getBotDeploymentDrain as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!
    const syncOrder = (client.syncBotDeploymentSchema as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!
    const activateOrder = (client.activateBotDeployment as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!
    expect(drainOrder).toBeLessThan(syncOrder)
    expect(syncOrder).toBeLessThan(activateOrder)
  })

  it('treats a missing runtime as an initial fenced deployment, never as a legacy PUT fallback', async () => {
    const initialDeployment = (phase: string) =>
      deployment(phase, {
        expectedCurrentVersionId: 0,
        fenceGeneration: phase === 'fenced' ? 1 : 2,
      })
    const client = fakeClient({
      getDeploymentEnvironment: vi.fn().mockRejectedValue(new errors.HTTPError(404, 'not found')),
      stageBotDeployment: vi.fn().mockResolvedValue({
        deployment: initialDeployment('fenced'),
      }),
      getBotDeploymentDrain: vi.fn().mockResolvedValue({
        drain: {
          beforeVersionId: 0,
          fenceGeneration: 1,
          counts: {},
          unitIds: [],
          drained: true,
        },
      }),
      syncBotDeploymentSchema: vi.fn().mockResolvedValue({
        deployment: initialDeployment('schema_synced'),
      }),
      activateBotDeployment: vi.fn().mockResolvedValue({
        deployment: initialDeployment('activated'),
      }),
    })

    await runStagedDeployment(client, { ...input, tableContractChanged: false })

    expect(client.stageBotDeployment).toHaveBeenCalledWith(
      expect.objectContaining({ expectedCurrentVersionId: 0 })
    )
    expect(client.bootstrapDeploymentEnvironment).not.toHaveBeenCalled()
    expect(client.enforceDeploymentEnvironment).not.toHaveBeenCalled()
    expect(client.setBotDeploymentFence).not.toHaveBeenCalled()
    expect(client.getBotDeploymentDrain).toHaveBeenCalledWith(
      expect.objectContaining({ beforeVersionId: 0, fenceGeneration: 1 })
    )
    expect(client.syncBotDeploymentSchema).toHaveBeenCalledTimes(1)
    expect(client.activateBotDeployment).toHaveBeenCalledTimes(1)
  })

  it('resumes a durable transitioning deployment without staging or fencing again', async () => {
    const client = fakeClient({
      getBotDeployment: vi.fn().mockResolvedValue({ deployment: deployment('transitioning', { fenceGeneration: 5 }) }),
      syncBotDeploymentSchema: vi
        .fn()
        .mockResolvedValueOnce({ deployment: deployment('transitioning', { fenceGeneration: 5 }) })
        .mockResolvedValueOnce({ deployment: deployment('schema_synced', { fenceGeneration: 5 }) }),
    })

    await runStagedDeployment(client, input, {
      now: vi.fn().mockReturnValue(0),
      sleep: vi.fn(),
    })

    expect(client.stageBotDeployment).not.toHaveBeenCalled()
    expect(client.setBotDeploymentFence).not.toHaveBeenCalled()
    expect(client.syncBotDeploymentSchema).toHaveBeenCalledTimes(2)
    expect(client.activateBotDeployment).toHaveBeenCalledTimes(1)
  })

  for (const crashPhase of ['staged', 'fenced', 'schema_synced', 'activated'] as const) {
    it(`resumes safely after process death immediately after durable ${crashPhase}`, async () => {
      let durable: ReturnType<typeof deployment> | undefined
      let crashed = false
      const mutationCounts = {
        staged: 0,
        fenced: 0,
        schema_synced: 0,
        activated: 0,
      }
      const persist = (phase: keyof typeof mutationCounts, extra: Record<string, unknown> = {}) => {
        durable = deployment(phase, extra)
        mutationCounts[phase]++
        if (phase === crashPhase && !crashed) {
          crashed = true
          throw new Error('simulated process kill after durable response was lost')
        }
        return { deployment: durable }
      }
      const client = fakeClient({
        getBotDeployment: vi.fn().mockImplementation(async () => {
          if (!durable) throw new errors.HTTPError(404, 'not found')
          return { deployment: durable }
        }),
        stageBotDeployment: vi.fn().mockImplementation(async () => persist('staged')),
        setBotDeploymentFence: vi
          .fn()
          .mockImplementation(async () => persist('fenced', { fenceGeneration: 5 })),
        getBotDeploymentDrain: vi.fn().mockResolvedValue({
          drain: {
            beforeVersionId: 10,
            fenceGeneration: 5,
            counts: {},
            unitIds: [],
            drained: true,
          },
        }),
        syncBotDeploymentSchema: vi
          .fn()
          .mockImplementation(async () => persist('schema_synced', { fenceGeneration: 5 })),
        activateBotDeployment: vi
          .fn()
          .mockImplementation(async () => persist('activated', { fenceGeneration: 6 })),
      })

      await expect(runStagedDeployment(client, input)).rejects.toThrow(
        'simulated process kill'
      )
      await expect(runStagedDeployment(client, input)).resolves.toMatchObject({
        phase: 'activated',
        transitionMode: 'fence',
      })

      expect(mutationCounts[crashPhase]).toBe(1)
      expect(durable).toMatchObject({ phase: 'activated' })
    })
  }

  it('fails closed when a durable deployment advertises an unsupported transition mode', async () => {
    const client = fakeClient({
      getBotDeployment: vi.fn().mockResolvedValue({
        deployment: {
          ...deployment('staged'),
          transitionMode: 'bridge',
        },
      }),
    })

    await expect(runStagedDeployment(client, input)).rejects.toThrow(
      'unsupported transition mode bridge'
    )
    expect(client.setBotDeploymentFence).not.toHaveBeenCalled()
  })

  it('leaves the durable fence in place when old executions miss the observation deadline', async () => {
    const client = fakeClient({
      getBotDeployment: vi.fn().mockResolvedValue({
        deployment: deployment('fenced', { fenceGeneration: 5 }),
      }),
      getBotDeploymentDrain: vi.fn().mockResolvedValue({
        drain: {
          beforeVersionId: 10,
          fenceGeneration: 5,
          counts: { 'jobs:pending': 1 },
          unitIds: ['jobs:unit-1'],
          drained: false,
        },
      }),
    })

    await expect(
      runStagedDeployment(client, input, {
        now: vi.fn().mockReturnValue(100),
        observationTimeoutMs: 0,
      })
    ).rejects.toThrow(
      /remains safely fenced.*jobs:pending=1.*jobs:unit-1.*brt bots deployments abort .*--bot-id bot-1/
    )
    expect(client.syncBotDeploymentSchema).not.toHaveBeenCalled()
    expect(client.activateBotDeployment).not.toHaveBeenCalled()
  })

  it('requires exact active bundle proof before adopting a legacy environment', async () => {
    const client = fakeClient({
      getDeploymentEnvironment: vi.fn().mockResolvedValue({
        environment: {
          ...(await fakeClient().getDeploymentEnvironment('bot-1', 'ws-1')).environment,
          enforcementState: 'legacy',
          currentContentHash: 'different',
        },
      }),
    })

    await expect(runStagedDeployment(client, input)).rejects.toThrow(/match the currently active bundle exactly/)
    expect(client.bootstrapDeploymentEnvironment).not.toHaveBeenCalled()
    expect(client.stageBotDeployment).not.toHaveBeenCalled()
  })

  it('fences and drains a code-only deployment before bundle cutover', async () => {
    const client = fakeClient()

    await runStagedDeployment(client, { ...input, tableContractChanged: false })

    expect(client.setBotDeploymentFence).toHaveBeenCalledTimes(1)
    expect(client.getBotDeploymentDrain).toHaveBeenCalledTimes(1)
    expect(client.syncBotDeploymentSchema).toHaveBeenCalledTimes(1)
    expect(client.activateBotDeployment).toHaveBeenCalledTimes(1)
    const drainOrder = (client.getBotDeploymentDrain as ReturnType<typeof vi.fn>)
      .mock.invocationCallOrder[0]!
    const activateOrder = (client.activateBotDeployment as ReturnType<typeof vi.fn>)
      .mock.invocationCallOrder[0]!
    expect(drainOrder).toBeLessThan(activateOrder)
  })
})
