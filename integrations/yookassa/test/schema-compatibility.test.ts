import { describe, expect, test } from 'bun:test'

import { actions } from '../definitions/actions'
import { configuration } from '../definitions/configuration'
import { events } from '../definitions/events'

describe('public catalog schema compatibility', () => {
  test('configuration, actions and events convert to JSON Schema', () => {
    expect(() => configuration.schema.toJSONSchema()).not.toThrow()
    for (const action of Object.values(actions)) {
      expect(() => action.input.schema.toJSONSchema()).not.toThrow()
      expect(() => action.output.schema.toJSONSchema()).not.toThrow()
    }
    for (const event of Object.values(events)) {
      expect(() => event.schema.toJSONSchema()).not.toThrow()
    }
  })

  test('createPayment accepts a fiscal receipt with a customer contact and service item', () => {
    expect(actions.createPayment.input.schema.parse({
      caseId: 'case-42',
      amount: { value: '1500.00', currency: 'RUB' },
      description: 'Юридическая консультация',
      returnUrl: 'https://example.test/return',
      idempotenceKey: 'case-42-payment',
      receipt: {
        customer: { email: 'customer@example.test' },
        items: [{
          description: 'Юридическая консультация',
          quantity: 1,
          amount: { value: '1500.00', currency: 'RUB' },
          vatCode: 1,
          paymentMode: 'full_payment',
          paymentSubject: 'service',
        }],
      },
    }).receipt).toBeDefined()
  })
})
