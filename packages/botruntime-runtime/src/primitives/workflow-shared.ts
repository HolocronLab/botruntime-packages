import { z } from '@holocronlab/botruntime-sdk'
import type { Client } from '@holocronlab/botruntime-client'
import { TrackedState, BUILT_IN_STATES } from '../runtime/index'
import { createStepSignal, isStepSignal } from './workflow-signal'

export { createStepSignal, isStepSignal, type StepExecutionSignal } from './workflow-signal'

export type WorkflowStepContext = {
  output?: unknown
  attempts: number
  maxAttempts?: number
  requestName?: string
  notificationName?: string
  startedAt: string
  finishedAt?: string
  steps?: Record<string, WorkflowStepContext>
  mapTotal?: number
  error?: {
    name?: string
    message: string
    stack?: string
    failedAt: string
    maxAttemptsReached: boolean
    operation?: string
    status?: number
    kind?: string
    ambiguous?: boolean
    cause?: Omit<WorkflowStepErrorDiagnostics, 'cause'>
  }
}

export type WorkflowStepErrorDiagnostics = {
  name?: string
  operation?: string
  status?: number
  kind?: string
  ambiguous?: boolean
  cause?: Omit<WorkflowStepErrorDiagnostics, 'cause'>
}

const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/
const SAFE_ERROR_OPERATION = /^[A-Z]{3,10} \/[A-Za-z0-9._~:/-]{1,240}$/
const SAFE_ERROR_KIND = /^[a-z][a-z0-9_-]{0,31}$/

function captureOneErrorDiagnostic(value: unknown): Omit<WorkflowStepErrorDiagnostics, 'cause'> {
  if (value === null || typeof value !== 'object') return {}
  const candidate = value as {
    name?: unknown
    operation?: unknown
    status?: unknown
    kind?: unknown
    ambiguous?: unknown
  }
  return {
    ...(typeof candidate.name === 'string' && SAFE_ERROR_NAME.test(candidate.name)
      ? { name: candidate.name }
      : {}),
    ...(typeof candidate.operation === 'string' && SAFE_ERROR_OPERATION.test(candidate.operation)
      ? { operation: candidate.operation }
      : {}),
    ...(typeof candidate.status === 'number' &&
    Number.isInteger(candidate.status) &&
    candidate.status >= 100 &&
    candidate.status <= 599
      ? { status: candidate.status }
      : {}),
    ...(typeof candidate.kind === 'string' && SAFE_ERROR_KIND.test(candidate.kind)
      ? { kind: candidate.kind }
      : {}),
    ...(typeof candidate.ambiguous === 'boolean' ? { ambiguous: candidate.ambiguous } : {}),
  }
}

export function captureWorkflowStepErrorDiagnostics(value: unknown): WorkflowStepErrorDiagnostics {
  const diagnostics = captureOneErrorDiagnostic(value)
  const cause =
    value !== null && typeof value === 'object'
      ? captureOneErrorDiagnostic((value as { cause?: unknown }).cause)
      : {}
  return {
    ...diagnostics,
    ...(Object.keys(cause).length > 0 ? { cause } : {}),
  }
}

function restoreErrorDiagnostic(
  message: string,
  diagnostics: Omit<WorkflowStepErrorDiagnostics, 'cause'>
): Error {
  const error = new Error(message)
  if (diagnostics.name) error.name = diagnostics.name
  Object.assign(error, {
    ...(diagnostics.operation ? { operation: diagnostics.operation } : {}),
    ...(diagnostics.status !== undefined ? { status: diagnostics.status } : {}),
    ...(diagnostics.kind ? { kind: diagnostics.kind } : {}),
    ...(diagnostics.ambiguous !== undefined ? { ambiguous: diagnostics.ambiguous } : {}),
  })
  return error
}

export function restoreWorkflowStepError(message: string, diagnostics: WorkflowStepErrorDiagnostics): Error {
  // Treat durable state as untrusted input too: older or corrupted records
  // must not smuggle arbitrary strings into telemetry attributes.
  const safeDiagnostics = captureOneErrorDiagnostic(diagnostics)
  const safeCause = diagnostics.cause ? captureOneErrorDiagnostic(diagnostics.cause) : undefined
  const cause =
    safeCause && Object.keys(safeCause).length > 0
      ? restoreErrorDiagnostic('Persisted workflow step cause', safeCause)
      : undefined
  const error = restoreErrorDiagnostic(message, safeDiagnostics)
  if (cause) {
    Object.assign(error, {
      cause,
      ...(safeDiagnostics.name === 'EvalProgressSinkError' ? { sinkCause: cause } : {}),
    })
  }
  return error
}

export const workflowStepContextSchema: z.ZodType<WorkflowStepContext> = z.lazy(() =>
  z.object({
    output: z.unknown().optional(),
    attempts: z.number(),
    i: z.number().optional(),
    requestName: z.string().optional(),
    notificationName: z.string().optional(),
    startedAt: z.string(),
    finishedAt: z.string().optional(),
    maxAttempts: z.number().optional(),
    steps: z.record(z.string(), workflowStepContextSchema).optional(),
    mapTotal: z.number().optional(),
    error: z
      .object({
        name: z.string().optional(),
        message: z.string(),
        stack: z.string().optional(),
        failedAt: z.string(),
        maxAttemptsReached: z.boolean(),
        operation: z.string().optional(),
        status: z.number().optional(),
        kind: z.string().optional(),
        ambiguous: z.boolean().optional(),
        cause: z
          .object({
            name: z.string().optional(),
            operation: z.string().optional(),
            status: z.number().optional(),
            kind: z.string().optional(),
            ambiguous: z.boolean().optional(),
          })
          .optional(),
      })
      .optional(),
  })
) as z.ZodType<WorkflowStepContext>

export const workflowExecutionContextSchema = z
  .object({
    executionCount: z.number().default(0),
    revision: z.number().default(0),
    steps: z.record(z.string(), workflowStepContextSchema),
  })
  .default({
    executionCount: 0,
    steps: {},
  })

export type WorkflowExecutionContext = z.infer<typeof workflowExecutionContextSchema>

export function createWorkflowExecutionState(client: Client, workflowId: string) {
  return TrackedState.create({
    type: 'workflow',
    client: client,
    id: workflowId,
    schema: workflowExecutionContextSchema,
    name: BUILT_IN_STATES.workflowSteps,
  })
}
