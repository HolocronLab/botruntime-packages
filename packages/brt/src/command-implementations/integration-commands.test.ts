import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../logger'
import { DeployCommand } from './deploy-command'
import { CloudIntegrationPublishCommand } from './integration-commands'

describe('CloudIntegrationPublishCommand', () => {
  let workDir: string

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-integration-'))
  })

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('publishes through the classic integration deploy path with public visibility', async () => {
    fs.writeFileSync(path.join(workDir, 'integration.definition.ts'), 'export default {}')

    const deploySpy = vi.spyOn(DeployCommand.prototype, 'run').mockImplementation(async function (this: DeployCommand) {
      expect((this as any).argv).toMatchObject({
        workDir,
        noBuild: true,
        dryRun: true,
        visibility: 'public',
        adk: false,
        watch: false,
      })
    })

    const command = new CloudIntegrationPublishCommand({} as any, {} as any, new Logger(), {
      workDir,
      botpressHome: path.join(workDir, '.botpress-home'),
      profile: undefined,
      apiUrl: undefined,
      token: undefined,
      workspaceId: undefined,
      secrets: [],
      noBuild: true,
      dryRun: true,
      sourceMap: false,
      minify: true,
      allowDeprecated: false,
      url: undefined,
      bypassBreakingChangeDetection: false,
    } as any)

    await command.run()

    expect(deploySpy).toHaveBeenCalledOnce()
  })

  it('rejects non-integration projects before invoking deploy', async () => {
    fs.writeFileSync(path.join(workDir, 'bot.definition.ts'), 'export default {}')
    const deploySpy = vi.spyOn(DeployCommand.prototype, 'run').mockResolvedValue()
    const command = new CloudIntegrationPublishCommand({} as any, {} as any, new Logger(), {
      workDir,
      botpressHome: path.join(workDir, '.botpress-home'),
      secrets: [],
      noBuild: true,
      dryRun: false,
      sourceMap: false,
      minify: true,
      allowDeprecated: false,
      bypassBreakingChangeDetection: false,
    } as any)

    await expect(command.run()).rejects.toThrow(/requires an integration project/i)
    expect(deploySpy).not.toHaveBeenCalled()
  })
})
