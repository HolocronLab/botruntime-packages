import { test, expect } from 'vitest'
import { IntegrationDefinition, type IntegrationDefinitionProps } from '.'
import { InterfaceDefinition } from '../../interface'
import { InterfacePackage } from '../../package'

test('integration definition exposes optional network policy', () => {
  const props = {
    name: 'telegram',
    version: '1.0.0',
    network: {
      providerHosts: ['api.telegram.org'],
      ingressRelayed: true,
      webhookAuthMode: 'provider_verified',
    },
  } satisfies IntegrationDefinitionProps

  const integration = new IntegrationDefinition(props)

  expect(integration.network).toEqual({
    providerHosts: ['api.telegram.org'],
    ingressRelayed: true,
    webhookAuthMode: 'provider_verified',
  })
})

test('integration definition supports handler-owned end-user authentication', () => {
  const integration = new IntegrationDefinition({
    name: 'chat',
    version: '0.1.0',
    network: { webhookAuthMode: 'handler_verified' },
  })

  expect(integration.network?.webhookAuthMode).toBe('handler_verified')
})

test('integration definition exposes maxExecutionTime', () => {
  expect(
    new IntegrationDefinition({
      name: 'slow',
      version: '1.0.0',
      maxExecutionTime: 119,
    }).maxExecutionTime
  ).toBe(119)
})

test('integration definition materializes the default maxExecutionTime', () => {
  expect(new IntegrationDefinition({ name: 'default', version: '1.0.0' }).maxExecutionTime).toBe(45)
})

test.each([0, -1, 1.5, 120])('integration definition rejects invalid maxExecutionTime %p', (maxExecutionTime) => {
  expect(
    () =>
      new IntegrationDefinition({
        name: 'slow',
        version: '1.0.0',
        maxExecutionTime,
      })
  ).toThrow(/maxExecutionTime/i)
})

test('integration definition exposes maxConcurrency', () => {
  expect(
    new IntegrationDefinition({
      name: 'parallel',
      version: '1.0.0',
      maxConcurrency: 4,
    }).maxConcurrency
  ).toBe(4)
})

test('integration definition materializes the default maxConcurrency', () => {
  expect(new IntegrationDefinition({ name: 'default', version: '1.0.0' }).maxConcurrency).toBe(1)
})

test.each([0, -1, 1.5, 5])('integration definition rejects invalid maxConcurrency %p', (maxConcurrency) => {
  expect(
    () =>
      new IntegrationDefinition({
        name: 'parallel',
        version: '1.0.0',
        maxConcurrency,
      })
  ).toThrow(/maxConcurrency/i)
})

test('integration with channel extending an interface with same channel merges channel tags', () => {
  // arrange
  const intrface = new InterfaceDefinition({
    name: 'foo',
    version: '0.0.0',
    channels: {
      theChannel: {
        messages: {},
      },
    },
  })

  const intrfacePackage = {
    type: 'interface',
    name: 'foo',
    version: '0.0.0',
    definition: intrface,
  } satisfies InterfacePackage

  // act
  const integration = new IntegrationDefinition({
    name: 'foo',
    version: '0.0.0',
    channels: {
      theChannel: {
        messages: {},
        conversation: { tags: { foo: {} } },
        message: { tags: { foo: {} } },
      },
    },
  }).extend(intrfacePackage, () => ({
    entities: {},
    channels: {
      theChannel: {
        conversation: {
          tags: {
            bar: {},
          },
        },
        message: {
          tags: {
            bar: {},
          },
        },
      },
    },
  }))

  // assert
  const actual = integration.channels!.theChannel
  const expected = {
    messages: {},
    conversation: { tags: { foo: {}, bar: {} } },
    message: { tags: { foo: {}, bar: {} } },
  }
  expect(actual).toEqual(expected)
})
