import { describe, expect, test } from 'vitest'
import { integrationHandler } from '.'

const request = {
  method: 'POST',
  path: '/',
  query: '',
  headers: {
    'x-bot-id': 'bot',
    'x-bot-user-id': 'bot-user',
    'x-integration-id': 'yadisk',
    'x-integration-alias': 'documents',
    'x-webhook-id': 'operation',
    'x-bp-operation': 'integration_operation',
    'x-bp-configuration': Buffer.from('{}').toString('base64'),
  },
  body: '{}',
}

describe('integration runtime cancellation', () => {
  test('forwards the host Lambda context abort signal to an unknown operation handler', async () => {
    const controller = new AbortController()
    let received: AbortSignal | undefined
    const handler = integrationHandler({
      unknownOperationHandler: async (
        { abortSignal }: { abortSignal?: AbortSignal },
      ) => {
        received = abortSignal
        return { status: 200, body: '{}' }
      },
    } as never)

    const response = await handler(request, {
      abortSignal: controller.signal,
    })

    expect(response).toEqual({ status: 200, body: '{}' })
    expect(received).toBe(controller.signal)
  })
})
