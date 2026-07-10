import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudapiClient } from '../api/cloudapi-client'
import * as adkBundle from '../adk-bundle'
import { Logger } from '../logger'
import { CloudIntegrationPublishCommand } from './integration-commands'

describe('CloudIntegrationPublishCommand', () => {
  let botpressHome: string
  let workDir: string

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-integration-'))
  })

  afterEach(() => {
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each([
    ['--api-url', 'argv'],
    ['BP_API_URL', 'env'],
  ])('rejects a foreign %s authority before sending the selected profile PAT or reading project inputs', async (_label, source) => {
    fs.writeFileSync(
      path.join(botpressHome, 'profiles.json'),
      JSON.stringify({
        default: {
          apiUrl: 'https://cloud.example',
          workspaceId: 'ws_123',
          token: 'brt_pat_xxx',
        },
      })
    )
    if (source === 'env') vi.stubEnv('BP_API_URL', 'https://foreign.example')
    const listSpy = vi.spyOn(CloudapiClient.prototype, 'listIntegrationDefinitions')
    const cmd = new CloudIntegrationPublishCommand({} as any, {} as any, new Logger(), {
      botpressHome,
      workDir,
      profile: undefined,
      apiUrl: source === 'argv' ? 'https://foreign.example' : undefined,
      name: 'telegram',
      versionNumber: '1.0.0',
      configSchemaFile: path.join(workDir, 'must-not-be-read.json'),
      noBundle: true,
      noBuild: true,
    } as any)

    await expect(cmd.run()).rejects.toThrow(/command target override.*selected profile/i)

    expect(listSpy).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(workDir, 'must-not-be-read.json'))).toBe(false)
  })

  it('passes workspaceId from the resolved profile into integration publish calls', async () => {
    fs.writeFileSync(
      path.join(botpressHome, 'profiles.json'),
      JSON.stringify({
        default: {
          apiUrl: 'https://cloud.example',
          workspaceId: 'ws_123',
          token: 'brt_pat_xxx',
        },
      })
    )
    const schemaPath = path.join(workDir, 'config-schema.json')
    fs.writeFileSync(schemaPath, JSON.stringify({ fields: {} }))
    const bundlePath = path.join(workDir, '.botpress', 'dist', 'index.cjs')
    const code = 'module.exports = {}'
    fs.mkdirSync(path.dirname(bundlePath), { recursive: true })
    fs.writeFileSync(bundlePath, code)

    const listSpy = vi
      .spyOn(CloudapiClient.prototype, 'listIntegrationDefinitions')
      .mockResolvedValue({ definitions: [] })
    const createSpy = vi.spyOn(CloudapiClient.prototype, 'createIntegrationDefinition').mockResolvedValue({
      id: 1,
      workspaceId: 123,
      name: 'telegram',
      version: '1.0.0',
      configSchema: { fields: {} },
      visibility: 'private',
    })
    const publishSpy = vi.spyOn(CloudapiClient.prototype, 'publishIntegrationBundle').mockResolvedValue({
      integrationId: 1,
      versionId: 2,
      contentHash: adkBundle.sha256(code),
    })

    const cmd = new CloudIntegrationPublishCommand({} as any, {} as any, new Logger(), {
      botpressHome,
      workDir,
      profile: undefined,
      apiUrl: undefined,
      name: 'telegram',
      versionNumber: '1.0.0',
      configSchemaFile: schemaPath,
      noBundle: false,
      noBuild: true,
    } as any)

    await (cmd as any).run()

    expect(listSpy).toHaveBeenCalledWith('ws_123')
    expect(createSpy).toHaveBeenCalledWith('telegram', '1.0.0', { fields: {} }, 'ws_123')
    expect(publishSpy).toHaveBeenCalledWith('telegram', '1.0.0', code, 'ws_123')
  })

  it('passes network from integration.definition.ts into the catalog definition upsert', async () => {
    fs.writeFileSync(
      path.join(botpressHome, 'profiles.json'),
      JSON.stringify({
        default: {
          apiUrl: 'https://cloud.example',
          workspaceId: 'ws_123',
          token: 'brt_pat_xxx',
        },
      })
    )
    const sdkEntry = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../botruntime-sdk/src/index.ts'
    )
    fs.writeFileSync(
      path.join(workDir, 'integration.definition.ts'),
      `
        import { IntegrationDefinition, z } from ${JSON.stringify(sdkEntry)}

        export default new IntegrationDefinition({
          name: 'telegram',
          version: '1.0.0',
          configuration: {
            schema: z.object({ botToken: z.string() }),
          },
          network: {
            providerHosts: ['api.telegram.org'],
            ingressRelayed: true,
          },
        })
      `
    )

    const listSpy = vi
      .spyOn(CloudapiClient.prototype, 'listIntegrationDefinitions')
      .mockResolvedValue({ definitions: [] })
    const createSpy = vi.spyOn(CloudapiClient.prototype, 'createIntegrationDefinition').mockResolvedValue({
      id: 1,
      workspaceId: 123,
      name: 'telegram',
      version: '1.0.0',
      configSchema: { fields: [] },
      visibility: 'private',
    })
    const publishSpy = vi.spyOn(CloudapiClient.prototype, 'publishIntegrationBundle').mockResolvedValue({
      integrationId: 1,
      versionId: 2,
      contentHash: adkBundle.sha256('module.exports = {}'),
    })

    const cmd = new CloudIntegrationPublishCommand({} as any, {} as any, new Logger(), {
      botpressHome,
      workDir,
      profile: undefined,
      apiUrl: undefined,
      name: undefined,
      versionNumber: undefined,
      configSchemaFile: undefined,
      noBundle: true,
      noBuild: true,
    } as any)

    await (cmd as any).run()

    expect(listSpy).toHaveBeenCalledWith('ws_123')
    expect(createSpy).toHaveBeenCalledWith('telegram', '1.0.0', expect.anything(), 'ws_123', {
      providerHosts: ['api.telegram.org'],
      ingressRelayed: true,
    })
    expect(publishSpy).not.toHaveBeenCalled()
  })
})
