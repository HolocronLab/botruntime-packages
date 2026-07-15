import { expect, test } from 'bun:test'
import definition from '../integration.definition'

test('chat is a first-party channel with handler-owned authentication', () => {
  expect(definition.name).toBe('chat')
  expect(definition.version).toBe('0.7.6')
  expect(definition.network as any).toEqual({
    providerHosts: [],
    ingressRelayed: false,
    webhookAuthMode: 'handler_verified',
  })
  expect(definition.channels?.channel?.messages).toHaveProperty('text')
  expect(definition.channels?.channel?.messages).toHaveProperty('file')
  expect(definition.configuration?.schema).toBeDefined()
})
