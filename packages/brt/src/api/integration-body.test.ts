import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { describe, expect, test } from 'vitest'
import type { Integration } from '@holocronlab/botruntime-client'
import {
  assertNetworkDeclared,
  prepareCreateIntegrationBody,
  prepareUpdateIntegrationBody,
} from './integration-body'

describe('integration deployment bodies', () => {
  test('preserves the platform network contract on the classic deploy path', async () => {
    const integration = new IntegrationDefinition({
      name: 'yookassa',
      version: '1.0.0',
      network: {
        providerHosts: ['api.yookassa.ru'],
        ingressRelayed: true,
        webhookAuthMode: 'provider_verified',
      },
    })

    const body = await prepareCreateIntegrationBody(integration)

    expect(body).toMatchObject({
      providerHosts: ['api.yookassa.ru'],
      ingressRelayed: true,
      webhookAuthMode: 'provider_verified',
    })
  })

  test('preserves the definition-owned integration execution budget', async () => {
    const body = await prepareCreateIntegrationBody(
      new IntegrationDefinition({
        name: 'slow',
        version: '1.0.0',
        maxExecutionTime: 119,
        network: { providerHosts: [] },
      }),
    )

    expect(body.maxExecutionTime).toBe(119)
  })

  test('materializes the default execution budget so update can clear an old override', async () => {
    const local = await prepareCreateIntegrationBody(
      new IntegrationDefinition({ name: 'default', version: '1.0.0', network: { providerHosts: [] } }),
    )
    const body = prepareUpdateIntegrationBody({ ...local, id: 'integration-id' }, {
      actions: {},
      events: {},
      states: {},
      entities: {},
      user: { tags: {} },
      channels: {},
      interfaces: {},
      configurations: {},
      attributes: {},
      configuration: { identifier: {} },
      identifier: {},
      maxExecutionTime: 119,
    } as unknown as Integration)

    expect(body.maxExecutionTime).toBe(45)
  })

  test('preserves the definition-owned integration concurrency limit', async () => {
    const local = await prepareCreateIntegrationBody(
      new IntegrationDefinition({
        name: 'parallel',
        version: '1.0.0',
        maxConcurrency: 4,
        network: { providerHosts: [] },
      }),
    )
    const body = prepareUpdateIntegrationBody(
      { ...local, id: 'integration-id' },
      {
        actions: {},
        events: {},
        states: {},
        entities: {},
        user: { tags: {} },
        channels: {},
        interfaces: {},
        configurations: {},
        attributes: {},
        configuration: { identifier: {} },
        identifier: {},
      } as unknown as Integration,
    )

    expect(body.maxConcurrency).toBe(4)
  })

  test('materializes the default concurrency limit so update can clear an old override', async () => {
    const local = await prepareCreateIntegrationBody(
      new IntegrationDefinition({ name: 'default', version: '1.0.0', network: { providerHosts: [] } }),
    )
    const body = prepareUpdateIntegrationBody(
      { ...local, id: 'integration-id' },
      {
        actions: {},
        events: {},
        states: {},
        entities: {},
        user: { tags: {} },
        channels: {},
        interfaces: {},
        configurations: {},
        attributes: {},
        configuration: { identifier: {} },
        identifier: {},
        maxConcurrency: 4,
      } as unknown as Integration,
    )

    expect(body.maxConcurrency).toBe(1)
  })

  test('preserves the platform network contract when classic deploy updates an integration', () => {
    const body = prepareUpdateIntegrationBody(
      {
        id: 'integration-id',
        providerHosts: ['api.yookassa.ru'],
        ingressRelayed: true,
        webhookAuthMode: 'provider_verified',
        maxExecutionTime: 119,
        maxConcurrency: 4,
      },
      {
        actions: {},
        events: {},
        states: {},
        entities: {},
        user: { tags: {} },
        channels: {},
        interfaces: {},
        configurations: {},
        attributes: {},
        configuration: { identifier: {} },
        identifier: {},
      } as unknown as Integration,
    )

    expect(body).toMatchObject({
      providerHosts: ['api.yookassa.ru'],
      ingressRelayed: true,
      webhookAuthMode: 'provider_verified',
      maxExecutionTime: 119,
      maxConcurrency: 4,
    })
  })

  test('serializes an explicit empty allowlist so redeploy can clear stale policy', async () => {
    const body = await prepareCreateIntegrationBody(
      new IntegrationDefinition({ name: 'plain', version: '1.0.0', network: { providerHosts: [] } }),
    )

    expect(body).toMatchObject({
      providerHosts: [],
      ingressRelayed: false,
      webhookAuthMode: 'shared_secret',
    })
  })

  test('preserves handler-owned authentication for first-party Chat', async () => {
    const body = await prepareCreateIntegrationBody(
      new IntegrationDefinition({
        name: 'chat',
        version: '0.7.6',
        network: { providerHosts: [], webhookAuthMode: 'handler_verified' },
      }),
    )

    expect(body.webhookAuthMode).toBe('handler_verified')
  })

  test('publish gate refuses an integration that never declared a network policy (DEVLP-167)', () => {
    expect(() =>
      assertNetworkDeclared(new IntegrationDefinition({ name: 'undeclared', version: '1.0.0' })),
    ).toThrow(/does not declare a network policy/)
  })

  test('publish gate refuses when `network` is set but `providerHosts` is omitted', () => {
    expect(() =>
      assertNetworkDeclared(
        new IntegrationDefinition({ name: 'partial-network', version: '1.0.0', network: { ingressRelayed: true } }),
      ),
    ).toThrow(/does not declare a network policy/)
  })

  test('non-publishing serialization keeps an undeclared network as an ABSENT key (server backstop)', async () => {
    const body = await prepareCreateIntegrationBody(
      new IntegrationDefinition({ name: 'legacy-read', version: '1.0.0' }),
    )
    expect(body.providerHosts).toBeUndefined()
  })
})
