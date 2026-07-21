import { afterEach, describe, expect, test } from 'bun:test'

import integration from '../src/index'
import { POCHTA_TRACKING_CREDENTIALS_MESSAGE } from '../src/registration-error'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('register handler error contract', () => {
  test('returns only the safe Runtime envelope for rejected tracking API credentials', async () => {
    const providerFault = `<?xml version="1.0"?>
      <soapenv:Envelope xmlns:soapenv="http://www.w3.org/2003/05/soap-envelope"
        xmlns:tracking="http://russianpost.org/operationhistory/data">
        <soapenv:Body><soapenv:Fault>
          <soapenv:Reason><soapenv:Text>Ошибка авторизации</soapenv:Text></soapenv:Reason>
          <soapenv:Detail>
            <tracking:AuthorizationFaultReason>Invalid api-user / super-secret</tracking:AuthorizationFaultReason>
          </soapenv:Detail>
        </soapenv:Fault></soapenv:Body>
      </soapenv:Envelope>`
    globalThis.fetch = Object.assign(
      async () => new Response(providerFault, { status: 500 }),
      { preconnect: originalFetch.preconnect },
    )

    const configuration = Buffer.from(JSON.stringify({
      login: 'api-user',
      password: 'super-secret',
    })).toString('base64')
    const logged: string[] = []
    const originalConsole = { error: console.error, log: console.log, warn: console.warn }
    const capture = (...values: unknown[]) => logged.push(values.map(String).join(' '))
    console.error = capture
    console.log = capture
    console.warn = capture

    let result: Awaited<ReturnType<typeof integration.handler>>
    try {
      result = await integration.handler({
        method: 'POST',
        path: '/',
        query: '',
        headers: {
          'content-type': 'application/json',
          'x-bp-operation': 'register',
          'x-bp-configuration-type': 'inline',
          'x-bp-configuration': configuration,
          'x-bot-id': 'bot-1',
          'x-bot-user-id': 'bot-1_bot',
          'x-integration-id': 'pochta',
          'x-integration-alias': 'pochta',
          'x-webhook-id': 'webhook-1',
        },
        body: JSON.stringify({ webhookUrl: 'https://example.test/hooks/webhook-1' }),
      })
    } finally {
      console.error = originalConsole.error
      console.log = originalConsole.log
      console.warn = originalConsole.warn
    }

    expect(result?.status).toBe(400)
    expect(JSON.parse(result?.body ?? '{}')).toMatchObject({
      code: 400,
      type: 'Runtime',
      message: POCHTA_TRACKING_CREDENTIALS_MESSAGE,
    })
    expect(result?.body).not.toContain('api-user')
    expect(result?.body).not.toContain('super-secret')
    expect(result?.body).not.toContain('AuthorizationFaultReason')
    expect(logged.join('\n')).not.toContain('api-user')
    expect(logged.join('\n')).not.toContain('super-secret')
    expect(logged.join('\n')).not.toContain('AuthorizationFaultReason')
  })
})
