import { describe, expect, it } from 'vitest'

import { withWorkflowExecutionEvent } from './workflow-utils'

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
