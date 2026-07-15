import { describe, expect, it } from 'vitest'
import { resolveIntegrationLinkConfiguration } from './project-command'

describe('integration link configuration', () => {
  it('maps Cloud manual configurationType to the singular default configuration', () => {
    expect(
      resolveIntegrationLinkConfiguration(
        { configuration: { identifier: { linkTemplateScript: 'default' } } } as any,
        'manual',
      )?.identifier?.linkTemplateScript,
    ).toBe('default')
  })

  it('resolves default and named configurations without changing their meaning', () => {
    const definition = {
      configuration: { identifier: { linkTemplateScript: 'default' } },
      configurations: {
        oauth: { identifier: { linkTemplateScript: 'oauth' } },
      },
    } as any

    expect(resolveIntegrationLinkConfiguration(definition, null)?.identifier?.linkTemplateScript).toBe('default')
    expect(resolveIntegrationLinkConfiguration(definition, 'default')?.identifier?.linkTemplateScript).toBe('default')
    expect(resolveIntegrationLinkConfiguration(definition, 'oauth')?.identifier?.linkTemplateScript).toBe('oauth')
  })
})
