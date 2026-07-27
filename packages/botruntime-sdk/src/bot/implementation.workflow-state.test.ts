import type * as client from '@holocronlab/botruntime-client'
import { describe, expect, it } from 'vitest'
import type { DefaultBot } from './common'
import { BotImplementation } from './implementation'
import {
  WORKFLOW_STATE_REPORTER,
  type WorkflowStateReporter,
} from './workflow-proxy'

type WorkflowBot = DefaultBot<{
  workflows: {
    jobs: {
      input: Record<string, never>
      output: Record<string, never>
      tags: Record<string, string>
    }
  }
}>

const workflow = (status: client.Workflow['status']): client.Workflow =>
  ({
    id: 'wf_1',
    name: 'jobs',
    status,
    input: {},
    output: {},
    tags: {},
  }) as client.Workflow

describe('workflow handler state propagation', () => {
  it('returns locally reported state to the next handler in the chain', async () => {
    const bot = new BotImplementation<WorkflowBot>({
      actions: {},
      plugins: {},
    })
    const statuses: client.Workflow['status'][] = []

    bot.on.workflowStart('jobs', async ({ workflow: actionable }) => {
      const reporter = (
        actionable as typeof actionable & {
          [WORKFLOW_STATE_REPORTER]: WorkflowStateReporter
        }
      )[WORKFLOW_STATE_REPORTER]
      await reporter(workflow('completed'))
    })
    bot.on.workflowStart('jobs', async ({ workflow: actionable }) => {
      statuses.push(actionable.status)
    })

    const handlers = (bot.workflowHandlers.started.jobs ?? []) as unknown as Array<
      (props: Record<string, unknown>) => Promise<client.Workflow>
    >
    let current = workflow('pending')
    for (const handler of handlers) {
      current = await handler({
        workflow: current,
        event: {
          id: 'evt_1',
          type: 'workflow_update',
          payload: {
            type: 'workflow_started',
            workflow: current,
          },
        } as never,
        client: {} as never,
        ctx: {} as never,
        logger: {} as never,
      })
    }

    expect(statuses).toEqual(['completed'])
    expect(current.status).toBe('completed')
  })
})
