import { describe, expect, it, vi } from 'vitest'
import * as config from '../config'
import { Logger } from '../logger'
import { CloudIntegrationInstallCommand, parseExactIntegrationRef } from './integration-commands'

describe('integrations install exact reference contract', () => {
  it('accepts a canonical exact SemVer and preserves it byte-for-byte', () => {
    expect(parseExactIntegrationRef('telegram@1.1.3')).toEqual({ name: 'telegram', version: '1.1.3' })
    expect(parseExactIntegrationRef('telegram@1.2.3-beta.1')).toEqual({
      name: 'telegram',
      version: '1.2.3-beta.1',
    })
  })

  it.each([
    'telegram',
    'telegram@',
    '@1.1.3',
    'telegram@latest',
    'telegram@^1.1.0',
    'telegram@~1.1.0',
    'telegram@>=1.1.0',
    'telegram@v1.1.3',
    'telegram@1.1',
    'telegram@1.1.3@extra',
    'telegram/private@1.1.3',
    'telegram integration@1.1.3',
  ])('rejects non-exact integration reference %j', (ref) => {
    expect(() => parseExactIntegrationRef(ref)).toThrow(/expected name@version with an exact SemVer/i)
  })

  it.each(['telegram', 'telegram@latest', 'telegram@^1.1.0'])('fails before any network or project lookup for %j', async (ref) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const command = new CloudIntegrationInstallCommand({} as any, {} as any, new Logger(), {
      ref,
      botpressHome: '/must-not-be-read',
      workDir: '/must-not-be-read',
      profile: undefined,
      apiUrl: undefined,
      botId: undefined,
      local: false,
      dev: false,
      alias: undefined,
      configFile: '/must-not-be-read/config.json',
      configStdin: false,
    } as any)

    await expect(command.run()).rejects.toThrow(/expected name@version with an exact SemVer/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('publishes the requirement in the command schema used by help and docs', () => {
    const ref = (config.schemas.cloudIntegrationInstall as Record<string, unknown>)['ref']
    expect(ref).toMatchObject({ type: 'string', positional: true, demandOption: true })
    expect((ref as { description: string }).description).toMatch(/name@version.*required.*exact SemVer/i)
    expect((ref as { description: string }).description).toContain('telegram@1.1.3')
  })
})
