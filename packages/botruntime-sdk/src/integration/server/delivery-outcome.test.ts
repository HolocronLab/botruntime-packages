import { describe, expect, test } from 'vitest'
import { DeliveryOutcomeError, deliveryOutcomeResponse, isDeliveryOutcomeError } from './delivery-outcome'
import { integrationHandler } from '.'

describe('delivery outcome contract', () => {
  test('survives bundle boundaries and returns a safe machine-readable response', () => {
    const error = new DeliveryOutcomeError({
      outcome: 'outcome_unknown',
      phase: 'provider_send',
      operation: 'sendDocument',
      code: 'TELEGRAM_PROVIDER_TIMEOUT',
      message: 'Provider request timed out after dispatch',
    })

    expect(
      isDeliveryOutcomeError({
        __IS_DELIVERY_OUTCOME_ERROR__: true,
        outcome: error.outcome,
        phase: error.phase,
        operation: error.operation,
        code: error.code,
        message: error.message,
      }),
    ).toBe(true)
    expect(deliveryOutcomeResponse(error)).toEqual({
      status: 504,
      headers: {
        'x-botruntime-delivery-status': 'outcome_unknown',
        'x-botruntime-delivery-phase': 'provider_send',
        'x-botruntime-delivery-operation': 'sendDocument',
        'x-botruntime-delivery-code': 'TELEGRAM_PROVIDER_TIMEOUT',
      },
      body: JSON.stringify({
        code: 'TELEGRAM_PROVIDER_TIMEOUT',
        message: 'Provider request timed out after dispatch',
      }),
    })
  })

  test('maps a definitive pre-provider failure to a non-retryable response', () => {
    const response = deliveryOutcomeResponse(
      new DeliveryOutcomeError({
        outcome: 'failed',
        phase: 'protected_download',
        operation: 'sendDocument',
        code: 'PROTECTED_DOWNLOAD_HTTP_401',
        message: 'Protected media download failed',
      }),
    )

    expect(response.status).toBe(422)
    expect(response.headers?.['x-botruntime-delivery-status']).toBe('failed')
  })

  test('returns provider ACK tags to the host', async () => {
    const firstTags = { id: '392', provider: 'telegram' }
    const handler = integrationHandler({
      channels: {
        telegram: {
          messages: {
            file: async ({ ack }: { ack: (props: { tags: Record<string, string> }) => Promise<void> }) => {
              await ack({ tags: firstTags })
              firstTags.id = 'mutated-after-ack'
              await ack({ tags: { 'botruntime.delivery.operation': 'sendDocument' } })
            },
          },
        },
      },
    } as never)

    const response = await handler({
      method: 'POST', path: '/', query: '',
      headers: {
        'x-bot-id': 'bot', 'x-bot-user-id': 'user', 'x-integration-id': 'telegram',
        'x-integration-alias': 'telegram', 'x-webhook-id': 'wh', 'x-bp-operation': 'message_created',
        'x-bp-configuration': Buffer.from('{}').toString('base64'),
      },
      body: JSON.stringify({
        conversation: { id: 'conv', channel: 'telegram', tags: {} }, user: { id: 'user', tags: {} },
        message: { id: 'message', tags: {} }, type: 'file', payload: { fileUrl: 'https://example.test/file' },
      }),
    })

    expect(response).toEqual({
      status: 200,
      body: JSON.stringify({
        ack: {
          tags: { id: '392', provider: 'telegram', 'botruntime.delivery.operation': 'sendDocument' },
        },
      }),
    })
  })
})
