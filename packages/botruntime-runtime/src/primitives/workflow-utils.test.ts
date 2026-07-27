import type { Workflow } from '@holocronlab/botruntime-client'
import { describe, expect, it, vi } from 'vitest'

import { context } from '../runtime/context/context'
import { updateWorkflow, withWorkflowExecutionEvent } from './workflow-utils'

const WORKFLOW_STATE_REPORTER = Symbol.for(
  '@holocronlab/botruntime-sdk/workflow-state-reporter'
)
type WorkflowStateReporter = (newState: Workflow) => Promise<void>

describe('withWorkflowExecutionEvent', () => {
  it('attaches the current execution event as a fencing token', () => {
    expect(withWorkflowExecutionEvent({ id: 'wf_1', status: 'completed' }, 'evt_1')).toEqual({
      id: 'wf_1',
      status: 'completed',
      eventId: 'evt_1',
    })
  })

  it('preserves an explicit event and does nothing outside workflow execution', () => {
    expect(withWorkflowExecutionEvent({ id: 'wf_1', eventId: 'evt_explicit' }, 'evt_context')).toEqual({
      id: 'wf_1',
      eventId: 'evt_explicit',
    })
    expect(withWorkflowExecutionEvent({ id: 'wf_1' }, undefined)).toEqual({ id: 'wf_1' })
  })
})

describe('updateWorkflow local state synchronization', () => {
  it.each(['in_progress', 'listening', 'completed', 'failed'] as const)(
    'reports authoritative %s state once for a shared context/control reference',
    async (status) => {
      const reporter = vi.fn<WorkflowStateReporter>()
      const current = {
        id: 'wf_1',
        name: 'jobs',
        status: 'pending',
        [WORKFLOW_STATE_REPORTER]: reporter,
      } as unknown as Workflow
      const updated = {
        ...current,
        status,
      } as Workflow
      const client = {
        updateWorkflow: vi.fn().mockResolvedValue({ workflow: updated }),
      }

      await context.run(
        {
          client,
          workflow: current,
          workflowControlContext: {
            workflow: current,
          },
          event: { id: 'evt_1' },
        } as never,
        () => updateWorkflow({ id: 'wf_1', status })
      )

      expect(client.updateWorkflow).toHaveBeenCalledWith({
        id: 'wf_1',
        status,
        eventId: 'evt_1',
      })
      expect(reporter).toHaveBeenCalledOnce()
      expect(reporter).toHaveBeenCalledWith(updated)
    }
  )
})
