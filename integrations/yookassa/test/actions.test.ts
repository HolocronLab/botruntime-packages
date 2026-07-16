import { describe, expect, test } from 'bun:test'
import { RuntimeError, type IntegrationLogger } from '@holocronlab/botruntime-sdk'

import { createPayment } from '../src/actions'
import { YookassaApiError, type YookassaClient } from '../src/yookassa-api'

describe('YooKassa action diagnostics', () => {
  test('logs safe provider fields when payment creation fails', async () => {
    const logs: string[] = []
    const logger = {
      forBot: () => ({
        info(message: string) { logs.push(message) },
        error(message: string) { logs.push(message) },
      }),
    } as unknown as IntegrationLogger
    const client = {
      createPayment: async () => {
        throw new YookassaApiError(
          400,
          'YooKassa API returned HTTP 400 (code=invalid_request, parameter=receipt)',
          'invalid_request',
          'receipt',
        )
      },
    } as unknown as YookassaClient

    const promise = createPayment(
      { shopId: 'shop-1', secretKey: 'secret-1' },
      {
        caseId: 'case-1',
        amount: { value: '100.00', currency: 'RUB' },
        description: 'Оплата',
        returnUrl: 'https://example.test/return',
        idempotenceKey: 'case-1-payment',
      },
      logger,
      client,
    )

    await expect(promise).rejects.toBeInstanceOf(RuntimeError)
    await expect(promise).rejects.toThrow('code=invalid_request, parameter=receipt')
    expect(logs).toEqual([
      'ЮKassa: createPayment failed (HTTP 400, code=invalid_request, parameter=receipt)',
    ])
    expect(logs.join(' ')).not.toContain('secret-1')
  })
})
