import { describe, expect, it } from 'vitest'
import {
  captureWorkflowStepErrorDiagnostics,
  restoreWorkflowStepError,
  workflowStepContextSchema,
} from './workflow-shared'

describe('workflow step persisted error diagnostics', () => {
  it('rehydrates a safe hosted sink cause across a fresh workflow generation', () => {
    const sinkCause = Object.assign(new Error('safe vortex failure'), {
      name: 'VortexEvalStoreError',
      operation: 'POST /v1/evals/runs/126/entries/1252/results',
      status: 503,
      kind: 'upstream',
      ambiguous: true,
    })
    const failure = Object.assign(new Error('safe sink failure', { cause: sinkCause }), {
      name: 'EvalProgressSinkError',
      operation: sinkCause.operation,
      status: sinkCause.status,
      kind: sinkCause.kind,
      ambiguous: sinkCause.ambiguous,
      sinkCause,
    })
    const diagnostics = captureWorkflowStepErrorDiagnostics(failure)
    const persisted = workflowStepContextSchema.parse({
      attempts: 5,
      startedAt: '2026-07-18T06:31:22.000Z',
      finishedAt: '2026-07-18T06:31:59.000Z',
      error: {
        message: 'Eval progress sink failed during POST /v1/evals/runs/126/entries/1252/results (HTTP 503)',
        failedAt: '2026-07-18T06:31:59.000Z',
        maxAttemptsReached: true,
        ...diagnostics,
      },
    })

    const restored = restoreWorkflowStepError(persisted.error!.message, persisted.error!)

    expect(restored).toMatchObject({
      name: 'EvalProgressSinkError',
      operation: sinkCause.operation,
      status: 503,
      kind: 'upstream',
      ambiguous: true,
      sinkCause: {
        name: 'VortexEvalStoreError',
        operation: sinkCause.operation,
        status: 503,
        kind: 'upstream',
        ambiguous: true,
      },
    })
    expect((restored as Error & { cause?: unknown }).cause).toBe(
      (restored as Error & { sinkCause?: unknown }).sinkCause
    )
  })

  it('drops unsafe arbitrary operation and kind strings from durable state', () => {
    const failure = Object.assign(new Error('failure'), {
      operation: 'POST /safe?token=CANARY_SECRET',
      kind: 'upstream\nCANARY_SECRET',
      status: 999,
      ambiguous: true,
    })

    expect(captureWorkflowStepErrorDiagnostics(failure)).toEqual({
      name: 'Error',
      ambiguous: true,
    })
    expect(
      restoreWorkflowStepError('persisted failure', {
        name: 'Error',
        operation: 'POST /safe?token=CANARY_SECRET',
        kind: 'upstream\nCANARY_SECRET',
        status: 999,
      })
    ).toEqual(expect.not.objectContaining({ operation: expect.anything(), kind: expect.anything(), status: 999 }))
  })
})
