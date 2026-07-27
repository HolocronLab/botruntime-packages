import type * as client from '@holocronlab/botruntime-client'
import { describe, expect, it, vi } from 'vitest'
import type * as types from '../types'
import { handleWorkflowUpdateEvent } from './update-handler'

const workflow = (status: client.Workflow['status']): client.Workflow =>
  ({
    id: 'wf_1',
    name: 'jobs',
    status,
    input: {},
    output: {},
    tags: {},
  }) as client.Workflow

const event = (state: client.Workflow): types.WorkflowUpdateEvent =>
  ({
    id: 'evt_1',
    type: 'workflow_update',
    payload: {
      type: 'workflow_started',
      workflow: state,
    },
  }) as types.WorkflowUpdateEvent

const props = (
  handler: (input: { workflow: client.Workflow }) => Promise<client.Workflow>
) => {
  const warn = vi.fn()
  const logger = {
    warn,
    info: vi.fn(),
    with: vi.fn(),
  }
  logger.with.mockReturnValue(logger)

  return {
    raw: {
      ctx: { type: 'workflow_update' },
      logger,
      self: {
        workflowHandlers: {
          started: {
            jobs: [handler],
          },
        },
      },
    } as never,
    warn,
  }
}

describe('workflow update pending warning', () => {
  it('does not warn when the handler returns a synchronized completed state', async () => {
    const { raw, warn } = props(async ({ workflow: current }) => ({
      ...current,
      status: 'completed',
    }))

    await handleWorkflowUpdateEvent(raw, event(workflow('pending')))

    expect(warn).not.toHaveBeenCalled()
  })

  it('still warns for a real no-op pending handler', async () => {
    const { raw, warn } = props(async ({ workflow: current }) => current)

    await handleWorkflowUpdateEvent(raw, event(workflow('pending')))

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('is still in pending status')
    )
  })
})
