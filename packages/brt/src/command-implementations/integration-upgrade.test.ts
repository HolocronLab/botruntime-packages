import { describe, expect, it } from 'vitest'
import type { WorkspaceIntegrationInstallation } from '../api/cloudapi-client'
import { parseExactIntegrationRef, resolveUniqueIntegrationInstallationByAlias } from './integration-commands'

const installation = (id: string, alias: string, ref = 'telegram@1.1.3'): WorkspaceIntegrationInstallation => {
  const separator = ref.lastIndexOf('@')
  return {
    id,
    name: ref.slice(0, separator),
    version: ref.slice(separator + 1),
    ref,
    alias,
    enabled: true,
    status: 'registered',
    statusReason: '',
    webhookId: `wh_${id}`,
    registered: true,
  }
}

describe('integrations upgrade exact target and alias resolution', () => {
  it('uses the same canonical exact SemVer parser as install', () => {
    expect(parseExactIntegrationRef('telegram@1.2.0')).toEqual({
      name: 'telegram',
      version: '1.2.0',
    })
    expect(() => parseExactIntegrationRef('telegram@latest')).toThrow(/exact SemVer/i)
    expect(() => parseExactIntegrationRef('telegram@^1.1.0')).toThrow(/exact SemVer/i)
  })

  it('returns the only installation with the selected alias', () => {
    const current = installation('7', 'primary')
    expect(resolveUniqueIntegrationInstallationByAlias([installation('6', 'backup'), current], 'primary')).toBe(current)
  })

  it('resolves an empty raw alias from the canonical integration name', () => {
    const current = installation('7', '')
    expect(resolveUniqueIntegrationInstallationByAlias([current], 'telegram')).toBe(current)
  })

  it('resolves a namespaced empty raw alias by full name or unqualified last segment', () => {
    const current = installation('7', '', 'botruntime/telegram@1.1.3')
    expect(resolveUniqueIntegrationInstallationByAlias([current], 'botruntime/telegram')).toBe(current)
    expect(resolveUniqueIntegrationInstallationByAlias([current], 'telegram')).toBe(current)
  })

  it('gives an explicit alias priority over an empty-alias derived candidate', () => {
    const explicit = installation('7', 'telegram', 'custom/channel@1.1.3')
    const derived = installation('8', '', 'botruntime/telegram@1.1.3')
    expect(resolveUniqueIntegrationInstallationByAlias([derived, explicit], 'telegram')).toBe(explicit)
  })

  it('fails loud when multiple empty-alias installations derive the same last-segment alias', () => {
    expect(() =>
      resolveUniqueIntegrationInstallationByAlias(
        [
          installation('7', '', 'botruntime/telegram@1.1.3'),
          installation('8', '', 'another/telegram@1.1.3'),
        ],
        'telegram'
      )
    ).toThrow(/2 integration installations.*alias "telegram"/i)
  })

  it('fails loud when the alias is absent', () => {
    expect(() => resolveUniqueIntegrationInstallationByAlias([], 'primary')).toThrow(
      /no integration installation.*alias "primary"/i
    )
  })

  it('fails loud when the alias is ambiguous', () => {
    expect(() =>
      resolveUniqueIntegrationInstallationByAlias(
        [installation('7', 'primary'), installation('8', 'primary')],
        'primary'
      )
    ).toThrow(/2 integration installations.*alias "primary"/i)
  })
})
