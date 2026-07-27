import type * as client from '@holocronlab/botruntime-client'
import { describe, expect, it, vi } from 'vitest'
import {
  WORKFLOW_STATE_REPORTER,
  wrapWorkflowInstance,
  type WorkflowStateReporter,
} from './proxy'

const workflow = (status: client.Workflow['status']): client.Workflow =>
  ({
    id: 'wf_1',
    name: 'jobs',
    status,
    input: {},
    output: {},
    tags: {},
  }) as client.Workflow

describe('workflow state reporter', () => {
  it('synchronizes the actionable snapshot without an API request', async () => {
    const updateWorkflow = vi.fn()
    const onWorkflowUpdate = vi.fn()
    const actionable = wrapWorkflowInstance({
      client: { updateWorkflow } as never,
      workflow: workflow('pending'),
      onWorkflowUpdate,
    })
    const reporter = (
      actionable as typeof actionable & {
        [WORKFLOW_STATE_REPORTER]: WorkflowStateReporter
      }
    )[WORKFLOW_STATE_REPORTER]

    await reporter(workflow('completed'))

    expect(actionable.status).toBe('completed')
    expect(onWorkflowUpdate).toHaveBeenCalledOnce()
    expect(onWorkflowUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf_1', status: 'completed' })
    )
    expect(updateWorkflow).not.toHaveBeenCalled()
  })

  it('uses a cross-package global symbol that is not serialized', () => {
    const actionable = wrapWorkflowInstance({
      client: {} as never,
      workflow: workflow('pending'),
    })

    expect(WORKFLOW_STATE_REPORTER).toBe(
      Symbol.for('@holocronlab/botruntime-sdk/workflow-state-reporter')
    )
    expect(
      Object.getOwnPropertyDescriptor(actionable, WORKFLOW_STATE_REPORTER)?.enumerable
    ).toBe(false)
    expect(JSON.stringify(actionable)).not.toContain('workflow-state-reporter')
  })
})
