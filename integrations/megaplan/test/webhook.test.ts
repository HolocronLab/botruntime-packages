import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import { parseEntityCommand, webhookHandler } from '../src/webhook'

test('provider command payload stays domain-neutral', () => {
  expect(
    parseEntityCommand(
      JSON.stringify({
        eventId: 'btn-17',
        entityType: 'deal',
        entityId: 'D1',
        command: 'advance_pipeline',
        arguments: { target: 'review', reason: 'operator_decision' },
        actorId: 'E2',
      })
    )
  ).toEqual({
    eventId: 'btn-17',
    entityType: 'deal',
    entityId: 'D1',
    command: 'advance_pipeline',
    arguments: { target: 'review', reason: 'operator_decision' },
    actorId: 'E2',
  })
})

test('provider boundary validates only the generic command envelope', () => {
  expect(() => parseEntityCommand('{"entityType":"deal","entityId":"D1","command":"advance"}')).toThrow()
  expect(() => parseEntityCommand('{"eventId":"E1","entityType":"","entityId":"D1","command":"advance"}')).toThrow()
  expect(() => parseEntityCommand('{"eventId":"E1","entityType":"deal","entityId":"D1","command":"advance","unexpected":true}')).toThrow()
})

test('webhook emits entityCommand only after provider-boundary validation', async () => {
  const events: any[] = []
  const response = await webhookHandler({
    req: {
      body: JSON.stringify({
        eventId: 'D1:advance:review', entityType: 'deal', entityId: 'D1',
        command: 'advance', arguments: { target: 'review' }, actorId: 'E2',
      }),
    },
    client: { createEvent: async (event: any) => events.push(event) },
  } as any)
  expect(response).toEqual({ status: 200 })
  expect(events).toEqual([{ type: 'entityCommand', payload: {
    eventId: 'D1:advance:review', entityType: 'deal', entityId: 'D1',
    command: 'advance', arguments: { target: 'review' }, actorId: 'E2',
  } }])
})

test('definition declares Megaplan egress and relayed ingress', () => {
  expect(definition.props.network).toEqual({
    providerHosts: ['*.megaplan.ru'],
    ingressRelayed: true,
    webhookAuthMode: 'shared_secret',
  })
})
