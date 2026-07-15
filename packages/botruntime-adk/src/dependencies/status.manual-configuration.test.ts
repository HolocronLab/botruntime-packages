import { describe, expect, it } from 'vitest'
import { computeIntegrationStatus, integrationRequiresAuthorization } from './status.js'

const singularConfigurationDefinition = {
  configuration: {
    schema: { required: ['token'] },
    identifier: { linkTemplateScript: 'https://example.test/connect' },
  },
} as any

describe('manual integration configuration', () => {
  it('validates Cloud configurationType manual against the singular configuration', () => {
    expect(
      computeIntegrationStatus({
        installed: true,
        spec: singularConfigurationDefinition,
        enabled: true,
        configurationType: 'manual',
        config: { token: 'configured' },
      }),
    ).toEqual({ state: 'available' })
  })

  it('preserves authorization detection for singular manual configuration', () => {
    expect(integrationRequiresAuthorization(singularConfigurationDefinition, 'manual')).toBe(true)
  })

  it('still fails closed for an unknown named configuration variant', () => {
    expect(
      computeIntegrationStatus({
        installed: true,
        spec: singularConfigurationDefinition,
        enabled: true,
        configurationType: 'oauth',
        config: { token: 'configured' },
      }),
    ).toEqual({ state: 'unresolved', reason: "configuration variant 'oauth' not found in spec" })
  })
})
