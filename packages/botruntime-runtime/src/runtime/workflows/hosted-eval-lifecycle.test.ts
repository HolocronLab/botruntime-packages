import { describe, expect, it, vi } from 'vitest'
import type { EvalDefinition, EvalProgressEvent, EvalReport, EvalRunReport } from '@holocronlab/botruntime-evals'
import { createStepSignal } from '../../primitives/workflow-signal'
import { HostedEvalLifecycle, type HostedEvalStep } from './hosted-eval-lifecycle'

const alpha: EvalDefinition = { name: 'alpha', conversation: [{ user: 'hello' }] }
const beta: EvalDefinition = { name: 'beta', type: 'regression', tags: ['nightly'], conversation: [] }

const alphaReport: EvalReport = {
  name: 'alpha',
  turns: [],
  outcomeAssertions: [],
  pass: true,
  duration: 12,
}

function mockStore() {
  return {
    startEntry: vi.fn(async (_runId: string, meta: { evalName: string }) => `entry-${meta.evalName}`),
    appendTurnResults: vi.fn(async () => undefined),
    appendOutcomeResults: vi.fn(async () => undefined),
    finalizeEntry: vi.fn(async (_runId: string, _entryId: string, _verdict: unknown) => undefined),
    addRunResults: vi.fn(async () => undefined),
    reconcileRunResults: vi.fn(async () => undefined),
    markRunComplete: vi.fn(async () => undefined),
  }
}

function recordingStep(names: string[]): HostedEvalStep {
  return async (name, action) => {
    names.push(name)
    return action()
  }
}

describe('HostedEvalLifecycle failure-safe orchestration', () => {
  it('synthesizes and finalizes every missing definition before an aborted run can complete', async () => {
    const store = mockStore()
    const steps: string[] = []
    const lifecycle = new HostedEvalLifecycle(store, '10', [alpha, beta])
    const report: EvalRunReport = {
      id: 'local',
      timestamp: new Date(0).toISOString(),
      evals: [],
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0,
      aborted: true,
    }

    await lifecycle.reconcileForCompletion(report, recordingStep(steps))

    expect(steps).toEqual(['finalize-aborted-evals', 'reconcile-run-results'])
    expect(store.startEntry.mock.calls.map((call) => call[1])).toEqual([
      { evalName: 'alpha' },
      { evalName: 'beta', evalType: 'regression', tags: ['nightly'] },
    ])
    expect(store.finalizeEntry.mock.calls.map((call) => call[2])).toEqual([
      { passed: false, durationMs: 0, errorKind: 'aborted' },
      { passed: false, durationMs: 0, errorKind: 'aborted' },
    ])
    expect(store.reconcileRunResults).toHaveBeenCalledWith('10', report)
    expect(lifecycle.completionOf(report)).toEqual({ aborted: true, errorKind: 'aborted' })
  })

  it('reconciles an exact completed report and never overwrites its successful verdict during catch terminalization', async () => {
    const store = mockStore()
    const steps: string[] = []
    const lifecycle = new HostedEvalLifecycle(store, '10', [alpha, beta])

    await lifecycle.onProgress({ type: 'eval_start', evalName: 'alpha', index: 0, totalTurns: 1 })
    await lifecycle.onProgress({ type: 'eval_complete', evalName: 'alpha', index: 0, report: alphaReport })
    const cause = new Error('execution failed')

    await expect(lifecycle.terminalizeFailure(cause, recordingStep(steps))).rejects.toBe(cause)

    expect(steps).toEqual(['reconcile-failed-run', 'fail-run'])
    expect(store.addRunResults).toHaveBeenCalledOnce()
    expect(store.addRunResults).toHaveBeenCalledWith('10', alphaReport)
    expect(store.finalizeEntry.mock.calls).toEqual([
      ['10', 'entry-alpha', { passed: true, durationMs: 12 }],
      ['10', 'entry-beta', { passed: false, durationMs: 0, errorKind: 'internal' }],
    ])
    expect(store.markRunComplete).toHaveBeenCalledWith('10', { errorKind: 'internal' })
  })

  it('uses aborted authority in the catch path and terminalizes all missing definitions', async () => {
    const store = mockStore()
    const controller = new AbortController()
    controller.abort()
    const lifecycle = new HostedEvalLifecycle(store, '10', [alpha], controller.signal)
    const cause = new Error('local detail must not cross the wire')

    await expect(lifecycle.terminalizeFailure(cause, recordingStep([]))).rejects.toBe(cause)

    expect(store.finalizeEntry).toHaveBeenCalledWith('10', 'entry-alpha', {
      passed: false,
      durationMs: 0,
      errorKind: 'aborted',
    })
    expect(store.markRunComplete).toHaveBeenCalledWith('10', { aborted: true, errorKind: 'aborted' })
  })

  it('remembers a replayed eval checkpoint for later failure reconciliation', async () => {
    const store = mockStore()
    const lifecycle = new HostedEvalLifecycle(store, '10', [alpha, beta])
    lifecycle.rememberCompletedReport(alphaReport)
    const cause = new Error('later checkpoint failed')

    await expect(lifecycle.terminalizeFailure(cause, recordingStep([]))).rejects.toBe(cause)

    expect(store.addRunResults).toHaveBeenCalledWith('10', alphaReport)
    expect(store.startEntry).toHaveBeenCalledOnce()
    expect(store.startEntry).toHaveBeenCalledWith('10', {
      evalName: 'beta',
      evalType: 'regression',
      tags: ['nightly'],
    })
  })

  it('keeps a completed eval error kind exact while only missing definitions become aborted', async () => {
    const store = mockStore()
    const controller = new AbortController()
    const lifecycle = new HostedEvalLifecycle(store, '10', [alpha, beta], controller.signal)
    const chatFailure: EvalReport = {
      ...alphaReport,
      pass: false,
      error: 'local chat detail',
      errorCode: 'CHAT_NOT_CONNECTED',
    }
    await lifecycle.onProgress({ type: 'eval_start', evalName: 'alpha', index: 0, totalTurns: 1 })
    await lifecycle.onProgress({ type: 'eval_complete', evalName: 'alpha', index: 0, report: chatFailure })
    controller.abort()
    const report: EvalRunReport = {
      id: 'local',
      timestamp: new Date(0).toISOString(),
      evals: [chatFailure],
      passed: 0,
      failed: 1,
      total: 1,
      duration: 12,
      aborted: true,
    }

    await lifecycle.reconcileForCompletion(report, recordingStep([]))

    expect(store.finalizeEntry.mock.calls).toEqual([
      ['10', 'entry-alpha', { passed: false, durationMs: 12, errorKind: 'chat' }],
      ['10', 'entry-beta', { passed: false, durationMs: 0, errorKind: 'aborted' }],
    ])
    expect(store.reconcileRunResults).toHaveBeenCalledWith('10', report)
    expect(lifecycle.completionOf(report)).toEqual({ aborted: true, errorKind: 'aborted' })
  })

  it('surfaces both the original error and a terminalization failure', async () => {
    const store = mockStore()
    const terminalError = new Error('terminal write failed')
    store.markRunComplete.mockRejectedValueOnce(terminalError)
    const lifecycle = new HostedEvalLifecycle(store, '10', [alpha])
    const cause = new Error('execution failed')

    let caught: unknown
    try {
      await lifecycle.terminalizeFailure(cause, recordingStep([]))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toEqual([cause, terminalError])
  })

  it('propagates a workflow yield during failure reconciliation without terminalizing the workflow', async () => {
    const store = mockStore()
    const lifecycle = new HostedEvalLifecycle(store, '10', [alpha])
    const cause = new Error('execution failed')
    const yieldSignal = createStepSignal()
    const yieldingStep: HostedEvalStep = async () => {
      throw yieldSignal
    }

    await expect(lifecycle.terminalizeFailure(cause, yieldingStep)).rejects.toBe(yieldSignal)
    expect(store.markRunComplete).not.toHaveBeenCalled()
  })

  it('propagates a live-ingest gap instead of logging and continuing', async () => {
    const store = mockStore()
    const ingestError = new Error('append failed')
    store.appendTurnResults.mockRejectedValueOnce(ingestError)
    const lifecycle = new HostedEvalLifecycle(store, '10', [alpha])
    await lifecycle.onProgress({ type: 'eval_start', evalName: 'alpha', index: 0, totalTurns: 1 })
    const event: EvalProgressEvent = {
      type: 'turn_complete',
      evalName: 'alpha',
      evalIndex: 0,
      turnIndex: 0,
      totalTurns: 1,
      turnReport: {
        turnIndex: 0,
        userMessage: 'private',
        botResponse: 'private',
        assertions: [],
        pass: true,
        botDuration: 1,
        evalDuration: 1,
      },
    }

    await expect(lifecycle.onProgress(event)).rejects.toBe(ingestError)
    await expect(lifecycle.terminalizeFailure(ingestError, recordingStep([]))).rejects.toBe(ingestError)
    expect(store.addRunResults).not.toHaveBeenCalled()
    expect(store.finalizeEntry).toHaveBeenCalledWith('10', 'entry-alpha', {
      passed: false,
      durationMs: 0,
      errorKind: 'internal',
    })
    expect(store.markRunComplete).toHaveBeenCalledWith('10', { errorKind: 'internal' })
  })
})
