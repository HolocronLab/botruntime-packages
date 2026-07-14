import { describe, expect, it } from 'vitest'
import { pendingIntegrationRegistrationCommands } from './integration-guidance'

describe('pendingIntegrationRegistrationCommands', () => {
  it('prints nothing when every installation is registered', () => {
    expect(
      pendingIntegrationRegistrationCommands([
        { webhookId: 'wh_ready', status: 'registered', registered: true },
      ])
    ).toEqual([])
  })

  it('returns exact commands only for pending installations', () => {
    expect(
      pendingIntegrationRegistrationCommands([
        { webhookId: 'wh_ready', status: 'registered', registered: true },
        { webhookId: 'wh_pending', status: 'pending', registered: false },
      ])
    ).toEqual(['brt integrations register wh_pending'])
  })
})
