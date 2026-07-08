import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Logger } from '../logger'
import * as requireUtils from '../utils/require-utils'
import { BundleCommand } from './bundle-command'

describe('BundleCommand', () => {
  let botpressHome: string
  let workDir: string

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-integration-'))
  })

  afterEach(() => {
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
  })

  it('exports the integration named handler when the project provides one', async () => {
    writeIntegrationProject(`
      const defaultHandler = () => 'default-handler'
      const adapterHandler = () => 'named-adapter'

      export const handler = adapterHandler
      export default { handler: defaultHandler }
    `)

    const bundle = await bundleIntegrationProject()

    expect(bundle.handler()).toBe('named-adapter')
    expect(bundle.default.handler()).toBe('default-handler')
  })

  it('falls back to the default export handler when the project has no named handler', async () => {
    writeIntegrationProject(`
      const defaultHandler = () => 'default-handler'

      export default { handler: defaultHandler }
    `)

    const bundle = await bundleIntegrationProject()

    expect(bundle.handler()).toBe('default-handler')
  })

  const writeIntegrationProject = (entrypoint: string) => {
    const sdkEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../botruntime-sdk/src/index.ts')

    fs.mkdirSync(path.join(workDir, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(workDir, 'integration.definition.ts'),
      `
        import { IntegrationDefinition } from ${JSON.stringify(sdkEntry)}

        export default new IntegrationDefinition({
          name: 'test',
          version: '1.0.0',
        })
      `
    )
    fs.writeFileSync(path.join(workDir, 'src', 'index.ts'), entrypoint)
  }

  const bundleIntegrationProject = async () => {
    const cmd = new BundleCommand({} as any, {} as any, new Logger({ json: true }), {
      botpressHome,
      workDir,
      profile: undefined,
      sourceMap: false,
      minify: false,
      verbose: false,
      json: true,
    } as any)

    await cmd.run()

    return requireUtils.requireJsFile<{
      default: { handler: () => string }
      handler: () => string
    }>(path.join(workDir, '.botpress', 'dist', 'index.cjs'))
  }
})
