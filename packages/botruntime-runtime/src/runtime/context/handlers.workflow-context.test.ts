import type { Workflow } from '@holocronlab/botruntime-client'
import { describe, expect, it } from 'vitest'

import { getHandlerWorkflowContext } from './handlers'

const workflow = (status: Workflow['status']): Workflow =>
  ({
    id: 'wf_1',
    name: 'jobs',
    status,
    input: {},
    output: {},
    tags: {},
  }) as Workflow

describe('handler workflow context', () => {
  it('uses the actionable workflow for workflow update handlers', () => {
    const actionable = workflow('completed')

    expect(
      getHandlerWorkflowContext({
        event: {
          type: 'workflow_update',
          payload: {
            workflow: workflow('pending'),
          },
        },
        workflow: actionable,
      } as never)
    ).toBe(actionable)
  })

  it('does not bind a loaded workflow for ordinary events with a workflow id', () => {
    expect(
      getHandlerWorkflowContext({
        event: {
          id: 'evt_1',
          type: 'workflow_data_request',
          workflowId: 'wf_1',
          payload: {},
        },
        workflow: workflow('in_progress'),
      } as never)
    ).toBeUndefined()
  })
})
