import { z } from '@holocronlab/botruntime-sdk'
import type { Client } from '@holocronlab/botruntime-client'
import { TrackedState, BUILT_IN_STATES } from '../runtime/index'

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
    message: string
    stack?: string
    failedAt: string
    maxAttemptsReached: boolean
  }
}

const StepSymbol = Symbol.for('StepSignal')

type StepExecutionSignal = {
  [StepSymbol]: true
}

export function isStepSignal(e: unknown): e is StepExecutionSignal {
  return typeof e === 'object' && e !== null && StepSymbol in e
}

export function createStepSignal(): StepExecutionSignal {
  return {
    [StepSymbol]: true,
  }
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
        message: z.string(),
        stack: z.string().optional(),
        failedAt: z.string(),
        maxAttemptsReached: z.boolean(),
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
