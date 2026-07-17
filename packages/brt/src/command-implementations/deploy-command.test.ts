import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as adkBundle from '../adk-bundle'
import * as toolchainContract from '../toolchain-contract'
import { CloudapiClient } from '../api/cloudapi-client'
import { Logger } from '../logger'
import * as utils from '../utils'
import { BuildCommand } from './build-command'
import { DeployCommand } from './deploy-command'
import { ProjectCommand } from './project-command'

function makeCommand(workDir: string, overrides: Record<string, unknown> = {}): DeployCommand {
  const argv = {
    workDir,
    adk: true,
    watch: false,
    noBuild: false,
    ...overrides,
  }
  return new DeployCommand(
    { newClient: vi.fn(() => ({ client: {} })) } as any,
    {} as any,
    new Logger(),
    argv as any
  )
}

function writeExistingBundle(workDir: string, code = 'module.exports = {}'): string {
  const bundlePath = path.join(workDir, '.brt', 'dist', 'index.cjs')
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true })
  fs.writeFileSync(bundlePath, code)
  return bundlePath
}

function writeVerifiedBundle(
  workDir: string,
  code: string,
  target: { apiUrl: string; workspaceId: string; botId: string }
): string {
  const bundlePath = writeExistingBundle(workDir, code)
  adkBundle.writeBundleProvenance(bundlePath, target, code)
  writeVerifiedToolchainContract(workDir, code)
  return bundlePath
}

function writeVerifiedToolchainContract(workDir: string, code: string): void {
  toolchainContract.writePlatformToolchainContract(
    workDir,
    toolchainContract.inspectPlatformToolchain(workDir),
    { bundleSha256: adkBundle.sha256(code) }
  )
}

type CapturedPut = {
  baseUrl: string
  apiKey: string
  args: Parameters<CloudapiClient['putBundle']>
}

function capturePutBundles(calls: CapturedPut[]) {
  return vi.spyOn(CloudapiClient.prototype, 'putBundle').mockImplementation(async function (
    this: CloudapiClient,
    ...args
  ) {
    calls.push({
      baseUrl: this.base,
      apiKey: (this as unknown as { apiKey: string }).apiKey,
      args,
    })
    return {}
  })
}

describe('DeployCommand ADK watch routing', () => {
  let workDir: string

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-deploy-watch-'))
    vi.spyOn(toolchainContract, 'assertPlatformToolchainCompatible').mockImplementation(() => undefined)
    vi.spyOn(adkBundle, 'loadAgentRecurringEvents').mockResolvedValue({})
    vi.spyOn(CloudapiClient.prototype, 'listWorkspaceIntegrations').mockResolvedValue({ installations: [] })
    vi.spyOn(adkBundle, 'loadAdkMigrationTools').mockResolvedValue({
      migrateFromConfig: vi.fn(async () => ({
        migrated: [],
        warnings: [],
        skipped: [],
      })),
    } as any)
  })

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('keeps deploy --adk one-shot when --watch is absent', async () => {
    const command = makeCommand(workDir)
    const deploySpy = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._deployAdkBundle = deploySpy

    await command.run()

    expect(deploySpy).toHaveBeenCalledOnce()
  })

  it('rejects deploy --watch without --adk before login or other side effects', async () => {
    const command = makeCommand(workDir, { adk: false, watch: true })
    const loginSpy = vi.fn().mockRejectedValue(new Error('login side effect'))
    ;(command as any).ensureLoginAndCreateClient = loginSpy

    await expect(command.run()).rejects.toThrow(/--watch.*--adk/)

    expect(loginSpy).not.toHaveBeenCalled()
  })

  it('rejects deploy --adk --watch --noBuild before deploying', async () => {
    const command = makeCommand(workDir, { watch: true, noBuild: true })
    const deploySpy = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._deployAdkBundle = deploySpy

    await expect(command.run()).rejects.toThrow(/--watch.*--noBuild/)

    expect(deploySpy).not.toHaveBeenCalled()
  })

  it('validates watch flags before inherited bootstrap can perform network work', async () => {
    const command = makeCommand(workDir, { adk: false, watch: true })
    const bootstrapSpy = vi.spyOn(ProjectCommand.prototype as any, 'bootstrap').mockResolvedValue(undefined)

    const result = await command.handler()

    expect(result.exitCode).toBe(1)
    expect(bootstrapSpy).not.toHaveBeenCalled()
  })

  it('rejects deploy --adk --dry-run before the ADK deploy path can create or mutate anything', async () => {
    const command = makeCommand(workDir, { dryRun: true })
    const deploySpy = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._deployAdkBundle = deploySpy

    await expect(command.run()).rejects.toThrow(/--adk.*--dry-run.*not supported/i)

    expect(deploySpy).not.toHaveBeenCalled()
    expect(fs.readdirSync(workDir)).toEqual([])
  })

  it('rejects deploy --adk --dry-run before inherited bootstrap can build, access the network, or write files', async () => {
    const command = makeCommand(workDir, { dryRun: true })
    const bootstrapSpy = vi.spyOn(ProjectCommand.prototype as any, 'bootstrap').mockResolvedValue(undefined)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await command.handler()

    expect(result.exitCode).toBe(1)
    expect(bootstrapSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(fs.readdirSync(workDir)).toEqual([])
  })

  it('does not reject classic deploy --dry-run as an unsupported ADK operation', async () => {
    const command = makeCommand(workDir, { adk: false, dryRun: true, noBuild: true })
    const classicPathReached = new Error('classic deploy path reached')
    const loginSpy = vi.fn().mockRejectedValue(classicPathReached)
    ;(command as any).ensureLoginAndCreateClient = loginSpy

    await expect(command.run()).rejects.toBe(classicPathReached)

    expect(loginSpy).toHaveBeenCalledOnce()
  })

  it('rejects a classic integration deploy when --noBuild has no reusable bundle', async () => {
    const command = makeCommand(workDir, {
      adk: false,
      noBuild: true,
      dryRun: true,
      visibility: 'public',
      public: false,
    })
    const manageWorkspaceHandle = vi
      .spyOn(command as any, 'manageWorkspaceHandle')
      .mockResolvedValue({ definition: { name: 'acme', version: '1.0.0' }, workspaceId: undefined })

    await expect(
      (command as any)._deployIntegration(
        {
          findPublicOrPrivateIntegration: vi.fn(),
          client: { validateIntegrationCreation: vi.fn() },
        },
        { name: 'acme', version: '1.0.0' }
      )
    ).rejects.toThrow(/bundle.*not found.*--noBuild/i)

    expect(manageWorkspaceHandle).not.toHaveBeenCalled()
  })

  it.each([
    ['--token', { token: 'explicit_token' }],
    ['--workspace-id', { workspaceId: 'explicit_workspace' }],
    ['--api-url', { apiUrl: 'https://explicit.example' }],
  ])('rejects deploy --adk %s before direct-run deployment side effects', async (_label, overrides) => {
    const command = makeCommand(workDir, overrides)
    const deploySpy = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._deployAdkBundle = deploySpy

    await expect(command.run()).rejects.toThrow(/selected profile/i)

    expect(deploySpy).not.toHaveBeenCalled()
    expect(fs.readdirSync(workDir)).toEqual([])
  })

  it.each([
    ['--token', { token: 'explicit_token' }],
    ['--workspace-id', { workspaceId: 'explicit_workspace' }],
    ['--api-url', { apiUrl: 'https://explicit.example' }],
  ])('rejects deploy --adk %s before inherited bootstrap', async (_label, overrides) => {
    const command = makeCommand(workDir, overrides)
    const bootstrapSpy = vi.spyOn(ProjectCommand.prototype as any, 'bootstrap').mockResolvedValue(undefined)
    const deploySpy = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._deployAdkBundle = deploySpy

    const result = await command.handler()

    expect(result.exitCode).toBe(1)
    expect(bootstrapSpy).not.toHaveBeenCalled()
    expect(deploySpy).not.toHaveBeenCalled()
    expect(fs.readdirSync(workDir)).toEqual([])
  })

  it('keeps explicit token/workspace flags available to classic deploy', async () => {
    const command = makeCommand(workDir, {
      adk: false,
      noBuild: true,
      token: 'classic_token',
      workspaceId: 'classic_workspace',
      apiUrl: 'https://classic.example',
    })
    const classicPathReached = new Error('classic deploy path reached')
    const loginSpy = vi.fn().mockRejectedValue(classicPathReached)
    ;(command as any).ensureLoginAndCreateClient = loginSpy

    await expect(command.run()).rejects.toBe(classicPathReached)

    expect(loginSpy).toHaveBeenCalledOnce()
  })

  it('deploys initially, ignores generated output, redeploys source changes, and closes the watcher', async () => {
    const command = makeCommand(workDir, { watch: true })
    const deploySpy = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._deployAdkBundle = deploySpy

    const close = vi.fn().mockResolvedValue(undefined)
    const watchSpy = vi.spyOn(utils.filewatcher.FileWatcher, 'watch').mockImplementation(async (dir, onChange) => {
      return {
        wait: async () => {
          await onChange([{ type: 'update', path: path.join(dir, '.adk', 'bot', 'generated.ts') }])
          await onChange([{ type: 'update', path: path.join(dir, 'src', 'agent.ts') }])
        },
        close,
      } as any
    })

    await command.run()

    expect(deploySpy).toHaveBeenCalledTimes(2)
    expect(watchSpy).toHaveBeenCalledWith(workDir, expect.any(Function), { debounceMs: 500 })
    expect(close).toHaveBeenCalledOnce()
  })

  it('subscribes before the initial deploy and drains a source change queued during it', async () => {
    const command = makeCommand(workDir, { watch: true })
    let onChange: Parameters<typeof utils.filewatcher.FileWatcher.watch>[1] | undefined
    const close = vi.fn().mockResolvedValue(undefined)
    const watchSpy = vi.spyOn(utils.filewatcher.FileWatcher, 'watch').mockImplementation(async (_dir, handler) => {
      onChange = handler
      return { wait: vi.fn().mockResolvedValue(undefined), close } as any
    })
    const deploySpy = vi.fn(async () => {
      if (deploySpy.mock.calls.length === 1) {
        expect(onChange).toBeDefined()
        await onChange!([{ type: 'update', path: path.join(workDir, 'src', 'during-initial.ts') }])
      }
    })
    ;(command as any)._deployAdkBundle = deploySpy

    await command.run()

    expect(watchSpy.mock.invocationCallOrder[0]).toBeLessThan(deploySpy.mock.invocationCallOrder[0]!)
    expect(deploySpy).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes the watcher when the initial deploy fails', async () => {
    const command = makeCommand(workDir, { watch: true })
    const deploySpy = vi.fn().mockRejectedValue(new Error('initial failure'))
    ;(command as any)._deployAdkBundle = deploySpy

    const wait = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const watchSpy = vi
      .spyOn(utils.filewatcher.FileWatcher, 'watch')
      .mockResolvedValue({ wait, close } as any)

    await expect(command.run()).rejects.toThrow(/initial deploy failed/)

    expect(watchSpy).toHaveBeenCalledOnce()
    expect(wait).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  })

  it('retries a failed changed deploy when another source change was queued, without overlap', async () => {
    const command = makeCommand(workDir, { watch: true })
    let activeDeploys = 0
    let maxActiveDeploys = 0
    let rejectChangedDeploy: ((reason?: unknown) => void) | undefined
    let markChangedDeployStarted: (() => void) | undefined
    const changedDeployStarted = new Promise<void>((resolve) => {
      markChangedDeployStarted = resolve
    })
    const changedDeployBlocked = new Promise<void>((_resolve, reject) => {
      rejectChangedDeploy = reject
    })
    const deploySpy = vi.fn(async () => {
      activeDeploys += 1
      maxActiveDeploys = Math.max(maxActiveDeploys, activeDeploys)
      try {
        if (deploySpy.mock.calls.length === 2) {
          markChangedDeployStarted?.()
          await changedDeployBlocked
        }
      } finally {
        activeDeploys -= 1
      }
    })
    ;(command as any)._deployAdkBundle = deploySpy

    vi.spyOn(utils.filewatcher.FileWatcher, 'watch').mockImplementation(async (dir, onChange) => ({
      wait: async () => {
        const firstChange = onChange([{ type: 'update', path: path.join(dir, 'src', 'first.ts') }])
        await changedDeployStarted
        await onChange([{ type: 'update', path: path.join(dir, 'src', 'second.ts') }])
        rejectChangedDeploy?.(new Error('first changed deploy failed'))
        await firstChange
      },
      close: vi.fn().mockResolvedValue(undefined),
    }) as any)

    await command.run()

    expect(deploySpy).toHaveBeenCalledTimes(3)
    expect(maxActiveDeploys).toBe(1)
  })

  it('uses only canonical agent.json coordinates for prod and ignores a poisoned bot.json target', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: '42', workspaceId: 'ws_profile', apiUrl: 'https://profile.example' })
    )
    fs.writeFileSync(
      path.join(workDir, 'bot.json'),
      JSON.stringify({ botId: 999, workspaceId: 999, apiUrl: 'https://poison.example' })
    )
    writeVerifiedBundle(workDir, 'canonical bundle', {
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      botId: '42',
    })
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const puts: CapturedPut[] = []
    capturePutBundles(puts)

    await (command as any)._deployAdkBundle()

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(puts).toEqual([
      {
        baseUrl: 'https://profile.example',
        apiKey: 'profile_pat',
        args: ['42', '42', 'canonical bundle', [], 'ws_profile', {}],
      },
    ])
    expect(JSON.stringify(puts)).not.toContain('999')
    expect(JSON.stringify(puts)).not.toContain('poison')
  })

  it('fresh --noBuild fails before provisioning, credential/link writes, build, or PUT', async () => {
    const botpressHome = path.join(workDir, '.brt-home')
    writeExistingBundle(workDir, 'unbound bundle')
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome,
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot').mockResolvedValue({
      botId: 77,
      workspaceId: 'ws_profile' as any,
      apiKey: 'per_bot_key',
    })
    const buildSpy = vi.spyOn(adkBundle, 'generateAgentBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/--noBuild.*linked|linked.*--noBuild/i)

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(buildSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
  })

  it('fresh --noBuild still refuses to provision when BRT_BUNDLE_PATH is set', async () => {
    const overridePath = path.join(workDir, 'trusted-but-unbound.cjs')
    fs.writeFileSync(overridePath, 'trusted override')
    vi.stubEnv('BRT_BUNDLE_PATH', overridePath)
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/--noBuild.*linked|linked.*--noBuild/i)

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['without override', false],
    ['with an override path that must not be read', true],
  ])('fresh local --noBuild rejects %s before provisioning or writes', async (_label, withOverride) => {
    const localPath = path.join(workDir, 'agent.local.json')
    const localBytes = JSON.stringify({
      workspaceId: 'ws_local',
      apiUrl: 'http://local.example',
      devId: 'dev_opaque',
      devTargetBotId: '303',
    })
    fs.writeFileSync(localPath, localBytes)
    if (withOverride) {
      const directoryOverride = path.join(workDir, 'override-directory')
      fs.mkdirSync(directoryOverride)
      vi.stubEnv('BRT_BUNDLE_PATH', directoryOverride)
    }
    const botpressHome = path.join(workDir, '.brt-home')
    const command = makeCommand(workDir, {
      profile: 'local',
      botpressHome,
      local: true,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'http://local.example',
      workspaceId: 'ws_local',
      token: 'local_profile_pat',
    })
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/--noBuild.*linked|linked.*--noBuild/i)

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
    expect(fs.readFileSync(localPath, 'utf8')).toBe(localBytes)
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
  })

  it('accepts an argv-only existing target with exact provenance without provisioning or writing a link', async () => {
    writeVerifiedBundle(workDir, 'argv-only bundle', {
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      botId: '42',
    })
    const botpressHome = path.join(workDir, '.brt-home')
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome,
      botId: '42',
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue(undefined)

    await (command as any)._deployAdkBundle()

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(putSpy).toHaveBeenCalledWith('42', '42', 'argv-only bundle', [], 'ws_profile', {})
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'agent.local.json'))).toBe(false)
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
  })

  it.each(['', '   '])('treats an explicit %j noBuild bot id as no target before path or remote effects', async (botId) => {
    const directoryOverride = path.join(workDir, 'must-not-be-read')
    fs.mkdirSync(directoryOverride)
    vi.stubEnv('BRT_BUNDLE_PATH', directoryOverride)
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      botId,
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/--noBuild.*linked|linked.*--noBuild/i)

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('rejects malformed default provenance before PUT, table sync, last-deploy, or local mutation', async () => {
    const agentPath = path.join(workDir, 'agent.json')
    const agentBytes = JSON.stringify({
      botId: '42',
      workspaceId: 'ws_profile',
      apiUrl: 'https://profile.example',
    })
    fs.writeFileSync(agentPath, agentBytes)
    const bundlePath = writeExistingBundle(workDir, 'linked bundle')
    fs.writeFileSync(`${bundlePath}.provenance.json`, '{')
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    const syncSpy = vi.fn().mockResolvedValue(undefined)
    const lastDeploySpy = vi.fn()
    ;(command as any)._syncAdkTables = syncSpy
    ;(command as any)._writeAdkLastDeploy = lastDeploySpy
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue(undefined)

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/provenance|rebuild without --noBuild/i)

    expect(putSpy).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
    expect(lastDeploySpy).not.toHaveBeenCalled()
    expect(fs.readFileSync(agentPath, 'utf8')).toBe(agentBytes)
  })

  it('rejects invalid provenance before legacy bot.json auto-migration or any remote mutation', async () => {
    fs.writeFileSync(
      path.join(workDir, 'bot.json'),
      JSON.stringify({ botId: 42, workspaceId: 7, apiUrl: 'https://legacy.example' })
    )
    writeExistingBundle(workDir, 'legacy unverified bundle')
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: '7',
      token: 'profile_pat',
    })
    const syncSpy = vi.fn().mockResolvedValue(undefined)
    const lastDeploySpy = vi.fn()
    ;(command as any)._syncAdkTables = syncSpy
    ;(command as any)._writeAdkLastDeploy = lastDeploySpy
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue(undefined)

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/provenance|rebuild without --noBuild/i)

    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
    expect(putSpy).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
    expect(lastDeploySpy).not.toHaveBeenCalled()
  })

  it('normal-deploy BRT_BUNDLE_PATH bypasses provenance only as an explicit trusted artifact with a loud warning', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: '42', workspaceId: 'ws_profile', apiUrl: 'https://profile.example' })
    )
    const overridePath = path.join(workDir, 'explicit-trusted.cjs')
    fs.writeFileSync(overridePath, 'trusted override bundle')
    vi.stubEnv('BRT_BUNDLE_PATH', overridePath)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: false,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue(undefined)
    const buildSpy = vi.spyOn(adkBundle, 'generateAgentBot')

    await (command as any)._deployAdkBundle()

    expect(buildSpy).not.toHaveBeenCalled()
    expect(putSpy).toHaveBeenCalledWith('42', '42', 'trusted override bundle', [], 'ws_profile', {})
    expect(stderr.mock.calls.flat().join(' ')).toMatch(/provenance.*bypass|explicitly trusted/i)
    expect(fs.existsSync(`${overridePath}.provenance.json`)).toBe(false)
  })

  it.each([
    ['missing', 'missing.cjs', false],
    ['directory', 'bundle-directory', true],
  ])('rejects a normal fresh deploy when BRT_BUNDLE_PATH is a %s before provisioning or writes', async (_label, name, makeDirectory) => {
    const overridePath = path.join(workDir, name)
    if (makeDirectory) fs.mkdirSync(overridePath)
    vi.stubEnv('BRT_BUNDLE_PATH', overridePath)
    const botpressHome = path.join(workDir, '.brt-home')
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome,
      local: false,
      noBuild: false,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/BRT_BUNDLE_PATH.*readable regular file/i)

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'agent.local.json'))).toBe(false)
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
  })

  it('--noBuild BRT_BUNDLE_PATH still requires adjacent exact provenance before PUT', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: '42', workspaceId: 'ws_profile', apiUrl: 'https://profile.example' })
    )
    const overridePath = path.join(workDir, 'unverified-override.cjs')
    fs.writeFileSync(overridePath, 'unverified override bundle')
    vi.stubEnv('BRT_BUNDLE_PATH', overridePath)
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    const syncSpy = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._syncAdkTables = syncSpy
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue(undefined)

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/provenance|rebuild without --noBuild/i)

    expect(putSpy).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
  })

  it('--noBuild BRT_BUNDLE_PATH accepts its own adjacent exact provenance rather than the canonical path', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: '42', workspaceId: 'ws_profile', apiUrl: 'https://profile.example' })
    )
    writeExistingBundle(workDir, 'canonical poison')
    const overridePath = path.join(workDir, 'verified-override.cjs')
    fs.writeFileSync(overridePath, 'verified override bundle')
    adkBundle.writeBundleProvenance(
      overridePath,
      { apiUrl: 'https://profile.example', workspaceId: 'ws_profile', botId: '42' },
      'verified override bundle'
    )
    writeVerifiedToolchainContract(workDir, 'verified override bundle')
    vi.stubEnv('BRT_BUNDLE_PATH', overridePath)
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue(undefined)

    await (command as any)._deployAdkBundle()

    expect(putSpy).toHaveBeenCalledWith('42', '42', 'verified override bundle', [], 'ws_profile', {})
  })

  it('normal ADK build writes exact target provenance before upload without secrets', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: '42', workspaceId: 'ws_profile', apiUrl: 'https://profile.example/' })
    )
    const bundlePath = writeExistingBundle(workDir, 'fresh normal bundle')
    fs.rmSync(`${bundlePath}.provenance.json`, { force: true })
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: false,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example/',
      workspaceId: 'ws_profile',
      token: 'SECRET_PROFILE_PAT',
    })
    ;(command as any)._buildAdkBundle = vi.fn().mockResolvedValue(bundlePath)
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const provenancePath = `${bundlePath}.provenance.json`
    let provenanceAtUpload: unknown
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle').mockImplementation(async () => {
      provenanceAtUpload = JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
      return undefined
    })

    await (command as any)._deployAdkBundle()

    const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
    expect(provenance).toEqual({
      schemaVersion: 1,
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      botId: '42',
      sha256: adkBundle.sha256('fresh normal bundle'),
    })
    expect(provenanceAtUpload).toEqual(provenance)
    expect(fs.readFileSync(provenancePath, 'utf8')).not.toContain('SECRET_PROFILE_PAT')
    expect(putSpy).toHaveBeenCalledOnce()
  })

  it('invalidates an old sidecar before a normal rebuild and leaves none when build fails', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: '42', workspaceId: 'ws_profile', apiUrl: 'https://profile.example' })
    )
    const bundlePath = writeExistingBundle(workDir, 'old bundle')
    const provenancePath = `${bundlePath}.provenance.json`
    fs.writeFileSync(
      provenancePath,
      JSON.stringify({
        schemaVersion: 1,
        apiUrl: 'https://profile.example',
        workspaceId: 'ws_profile',
        botId: '42',
        sha256: adkBundle.sha256('old bundle'),
      })
    )
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: false,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    ;(command as any)._buildAdkBundle = vi.fn().mockRejectedValue(new Error('native build failed'))
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/native build failed/)

    expect(fs.existsSync(provenancePath)).toBe(false)
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('uploads the exact verified noBuild bytes even if the bundle file changes after validation', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: '42', workspaceId: 'ws_profile', apiUrl: 'https://profile.example' })
    )
    const bundlePath = writeExistingBundle(workDir, 'verified bytes')
    fs.writeFileSync(
      `${bundlePath}.provenance.json`,
      JSON.stringify({
        schemaVersion: 1,
        apiUrl: 'https://profile.example',
        workspaceId: 'ws_profile',
        botId: '42',
        sha256: adkBundle.sha256('verified bytes'),
      })
    )
    writeVerifiedToolchainContract(workDir, 'verified bytes')
    const originalValidate = adkBundle.validateBundleProvenance
    const validateSpy = vi.spyOn(adkBundle, 'validateBundleProvenance').mockImplementation((...args) => {
      const verified = originalValidate(...args)
      fs.writeFileSync(bundlePath, 'raced replacement')
      return verified
    })
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'rotated_profile_pat',
    })
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue(undefined)

    await (command as any)._deployAdkBundle()

    expect(validateSpy).toHaveBeenCalledOnce()
    expect(putSpy).toHaveBeenCalledWith('42', '42', 'verified bytes', [], 'ws_profile', {})
    expect(fs.readFileSync(bundlePath, 'utf8')).toBe('raced replacement')
  })

  it('rejects a foreign BP_API_URL before build or PAT network even when agent.json contains the same poisoned host', async () => {
    vi.stubEnv('BP_API_URL', 'https://foreign.example')
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: '42', workspaceId: 'ws_profile', apiUrl: 'https://foreign.example' })
    )
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    const generateSpy = vi.spyOn(adkBundle, 'generateAgentBot').mockRejectedValue(new Error('generation side effect'))
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/command target override.*selected profile/i)

    expect(generateSpy).not.toHaveBeenCalled()
    expect(provisionSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('uses the selected profile host during legacy bot.json migration and never sends its PAT to the legacy host', async () => {
    fs.writeFileSync(
      path.join(workDir, 'bot.json'),
      JSON.stringify({ botId: 42, workspaceId: 7, apiUrl: 'https://poison.example' })
    )
    writeVerifiedBundle(workDir, 'legacy bundle', {
      apiUrl: 'https://profile.example',
      workspaceId: '7',
      botId: '42',
    })
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: '7',
      token: 'profile_pat',
    })
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const puts: CapturedPut[] = []
    capturePutBundles(puts)

    await (command as any)._deployAdkBundle()

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(puts).toEqual([
      {
        baseUrl: 'https://profile.example',
        apiKey: 'profile_pat',
        args: ['42', '42', 'legacy bundle', [], '7', {}],
      },
    ])
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8'))).toEqual({
      botId: '42',
      workspaceId: '7',
      apiUrl: 'https://profile.example',
    })
    expect(JSON.stringify(puts)).not.toContain('poison')
  })

  it('rejects a legacy bot.json workspace mismatch before migration, generation, provisioning, or PUT', async () => {
    fs.writeFileSync(
      path.join(workDir, 'bot.json'),
      JSON.stringify({ botId: 42, workspaceId: 8, apiUrl: 'https://legacy.example' })
    )
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: '7',
      token: 'profile_pat',
    })
    const generateSpy = vi.spyOn(adkBundle, 'generateAgentBot').mockRejectedValue(new Error('generation side effect'))
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(
      /bot\.json.*workspaceId.*8.*selected profile.*7/i
    )

    expect(generateSpy).not.toHaveBeenCalled()
    expect(provisionSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
  })

  it.each([
    [
      'workspaceId',
      { botId: '42', workspaceId: 'ws_other', apiUrl: 'https://profile.example' },
      /agent\.json.*workspaceId.*ws_other.*ws_profile/i,
    ],
    [
      'apiUrl',
      { botId: '42', workspaceId: 'ws_profile', apiUrl: 'https://other.example' },
      /agent\.json.*apiUrl.*other\.example.*profile\.example/i,
    ],
  ])('rejects a canonical prod %s mismatch before generation, provisioning, or PUT', async (_field, info, message) => {
    fs.writeFileSync(path.join(workDir, 'agent.json'), JSON.stringify(info))
    const command = makeCommand(workDir, {
      profile: 'selected',
      botpressHome: path.join(workDir, '.brt-home'),
      local: false,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    const generateSpy = vi.spyOn(adkBundle, 'generateAgentBot').mockRejectedValue(new Error('generation side effect'))
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(message)

    expect(generateSpy).not.toHaveBeenCalled()
    expect(provisionSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('deploy --adk --local uses agent.local only and preserves prod bytes plus dev metadata', async () => {
    const prodBytes = JSON.stringify({
      botId: '101',
      workspaceId: 'ws_prod',
      apiUrl: 'https://prod.example',
    })
    fs.writeFileSync(path.join(workDir, 'agent.json'), prodBytes)
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        botId: '202',
        workspaceId: 'ws_local',
        apiUrl: 'http://local.example',
        devId: 'dev_opaque',
        devTargetBotId: '303',
      })
    )
    writeVerifiedBundle(workDir, 'local bundle', {
      apiUrl: 'http://local.example',
      workspaceId: 'ws_local',
      botId: '202',
    })
    const command = makeCommand(workDir, {
      profile: 'local',
      botpressHome: path.join(workDir, '.brt-home'),
      local: true,
      noBuild: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'http://local.example',
      workspaceId: 'ws_local',
      token: 'local_profile_pat',
    })
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const puts: CapturedPut[] = []
    capturePutBundles(puts)

    await (command as any)._deployAdkBundle()

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(puts).toEqual([
      {
        baseUrl: 'http://local.example',
        apiKey: 'local_profile_pat',
        args: ['202', '202', 'local bundle', [], 'ws_local', {}],
      },
    ])
    expect(fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8')).toBe(prodBytes)
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf8'))).toEqual({
      botId: '202',
      workspaceId: 'ws_local',
      apiUrl: 'http://local.example',
      devId: 'dev_opaque',
      devTargetBotId: '303',
    })
  })

  it('fresh deploy --adk --local provisions and writes only agent.local while preserving dev metadata', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        workspaceId: '8',
        apiUrl: 'http://local.example',
        devId: 'dev_opaque',
        devTargetBotId: '303',
      })
    )
    const bundlePath = writeExistingBundle(workDir, 'fresh local bundle')
    const command = makeCommand(workDir, {
      profile: 'local',
      botpressHome: path.join(workDir, '.brt-home'),
      local: true,
      noBuild: false,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'http://local.example',
      workspaceId: '8',
      token: 'local_profile_pat',
    })
    ;(command as any)._buildAdkBundle = vi.fn().mockResolvedValue(bundlePath)
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const provisionAuth: Array<{ baseUrl: string; apiKey: string }> = []
    vi.spyOn(CloudapiClient.prototype, 'provisionBot').mockImplementation(async function (this: CloudapiClient) {
      provisionAuth.push({
        baseUrl: this.base,
        apiKey: (this as unknown as { apiKey: string }).apiKey,
      })
      return { botId: 202, workspaceId: 8, apiKey: 'per_bot_key' }
    })
    const puts: CapturedPut[] = []
    capturePutBundles(puts)

    await (command as any)._deployAdkBundle()

    expect(provisionAuth).toEqual([{ baseUrl: 'http://local.example', apiKey: 'local_profile_pat' }])
    expect(puts).toEqual([
      {
        baseUrl: 'http://local.example',
        apiKey: 'local_profile_pat',
        args: ['202', '202', 'fresh local bundle', [], '8', {}],
      },
    ])
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf8'))).toEqual({
      botId: '202',
      workspaceId: '8',
      apiUrl: 'http://local.example',
      devId: 'dev_opaque',
      devTargetBotId: '303',
    })
  })

  it.each([
    ['missing botId', { apiKey: 'per_bot_key', workspaceId: 8 }],
    ['null botId', { botId: null, apiKey: 'per_bot_key', workspaceId: 8 }],
    ['unsafe numeric botId', { botId: Number.MAX_SAFE_INTEGER + 1, apiKey: 'per_bot_key', workspaceId: 8 }],
    ['empty apiKey', { botId: 202, apiKey: '', workspaceId: 8 }],
    ['foreign workspace', { botId: 202, apiKey: 'per_bot_key', workspaceId: 9 }],
  ])('rejects a provision response with %s before credential/link writes or build', async (_label, response) => {
    const botpressHome = path.join(workDir, '.brt-home')
    const command = makeCommand(workDir, { profile: 'selected', botpressHome, local: false })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: '8',
      token: 'profile_pat',
    })
    vi.spyOn(CloudapiClient.prototype, 'provisionBot').mockResolvedValue(response as any)
    const generateSpy = vi.spyOn(adkBundle, 'generateAgentBot').mockRejectedValue(new Error('generation side effect'))
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/invalid provision response/i)

    expect(generateSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'agent.local.json'))).toBe(false)
  })

  it.each([
    ['apiUrl', { botId: '202', workspaceId: '8' }, /agent\.local\.json.*apiUrl/i],
    ['workspaceId', { botId: '202', apiUrl: 'http://local.example' }, /agent\.local\.json.*workspaceId/i],
  ])('strict --local rejects a missing %s before generation, provisioning, or PUT', async (_field, info, message) => {
    fs.writeFileSync(path.join(workDir, 'agent.local.json'), JSON.stringify(info))
    const command = makeCommand(workDir, {
      profile: 'local',
      botpressHome: path.join(workDir, '.brt-home'),
      local: true,
    })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'http://must-not-fallback.example',
      workspaceId: 'ws_must_not_fallback',
      token: 'local_profile_pat',
    })
    const generateSpy = vi.spyOn(adkBundle, 'generateAgentBot').mockRejectedValue(new Error('generation side effect'))
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(message)

    expect(generateSpy).not.toHaveBeenCalled()
    expect(provisionSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('rejects a local stack that differs from the selected profile before generation, provisioning, or key writes', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ botId: '202', workspaceId: 'ws_local', apiUrl: 'http://local.example' })
    )
    const botpressHome = path.join(workDir, '.brt-home')
    const command = makeCommand(workDir, { profile: 'selected', botpressHome, local: true })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://profile.example',
      workspaceId: 'ws_profile',
      token: 'profile_pat',
    })
    const generateSpy = vi.spyOn(adkBundle, 'generateAgentBot').mockRejectedValue(new Error('generation side effect'))
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const putSpy = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/agent\.local\.json.*selected profile/i)

    expect(generateSpy).not.toHaveBeenCalled()
    expect(provisionSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
  })

  it('--noBuild table sync pins project loading and TableManager to prod despite poisoned agent.local', async () => {
    const rawProd = { botId: '42', workspaceId: 'ws_prod', apiUrl: 'https://prod.example' }
    const mergedWithPoison = {
      botId: '999',
      workspaceId: 'ws_local_poison',
      apiUrl: 'http://local.poison',
      devId: 'dev_poison',
      devTargetBotId: '777',
    }
    const project = {
      tables: [{ name: 'Cases' }],
      agentInfo: mergedWithPoison,
    }
    const captured: Array<{ project: any; botId?: string; credentials?: Record<string, string> }> = []
    class TableManager {
      public constructor(options: { project: any; botId?: string; credentials?: Record<string, string> }) {
        captured.push(options)
      }
      public async createSyncPlan() {
        return { items: [{ operation: 'none', localTable: { name: 'Cases' } }] }
      }
      public async executeSync(plan: { items: unknown[] }) {
        return { success: plan.items, failed: [], skipped: [] }
      }
    }
    const load = vi.fn().mockResolvedValue(project)
    vi.spyOn(adkBundle, 'loadAdkTableManager').mockResolvedValue({
      AgentProject: { load },
      TableManager,
    } as any)
    const command = makeCommand(workDir, { local: false, noBuild: true })

    await (command as any)._syncAdkTables(
      workDir,
      'https://prod.example',
      '42',
      { token: 'prod_pat', apiUrl: 'https://prod.example', workspaceId: 'ws_prod' },
      rawProd
    )

    expect(load).toHaveBeenCalledWith(workDir, {
      adkCommand: 'adk-build',
      configTarget: {
        environment: 'prod',
        botId: '42',
        credentials: { token: 'prod_pat', apiUrl: 'https://prod.example', workspaceId: 'ws_prod' },
      },
    })
    expect(captured).toHaveLength(1)
    expect(captured[0]).toMatchObject({
      botId: '42',
      credentials: { token: 'prod_pat', apiUrl: 'https://prod.example', workspaceId: 'ws_prod' },
    })
    expect(captured[0]?.project.agentInfo).toEqual(rawProd)
    expect(JSON.stringify(captured)).not.toContain('local.poison')
    expect(JSON.stringify(captured)).not.toContain('ws_local_poison')
  })

  it('passes adk-build, authoritative credentials, and the exact resolved canonical prod bot id to generation', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: '42', workspaceId: 'ws_123', apiUrl: 'https://cloud.example' })
    )
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ botId: '999', devId: 'dev_must_not_be_used' })
    )
    const botpressHome = path.join(workDir, '.brt-home')
    const bundlePath = path.join(workDir, 'bundle.cjs')
    fs.writeFileSync(bundlePath, 'module.exports = {}')
    const command = makeCommand(workDir, { profile: 'default', botpressHome, local: false })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://cloud.example',
      workspaceId: 'ws_123',
      token: 'pat',
    })
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const generateSpy = vi
      .spyOn(adkBundle, 'generateAgentBot')
      .mockResolvedValue(path.join(workDir, '.adk', 'bot'))
    vi.spyOn(adkBundle, 'normalizeBundle').mockReturnValue(bundlePath)
    vi.spyOn(BuildCommand.prototype, 'run').mockResolvedValue(undefined)
    vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue(undefined)
    const provisionSpy = vi.spyOn(CloudapiClient.prototype, 'provisionBot')

    await (command as any)._deployAdkBundle()

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(generateSpy).toHaveBeenCalledWith(workDir, expect.any(Function), {
      adkCommand: 'adk-build',
      configTarget: {
        environment: 'prod',
        botId: '42',
        credentials: { token: 'pat', apiUrl: 'https://cloud.example', workspaceId: 'ws_123' },
      },
    })
    expect(JSON.stringify(generateSpy.mock.calls)).not.toContain('999')
    expect(JSON.stringify(generateSpy.mock.calls)).not.toContain('dev_must_not_be_used')
  })

  it('passes adk-build, authoritative credentials, and the newly provisioned prod bot id to generation', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ botId: '999', devId: 'dev_must_not_be_used' })
    )
    const botpressHome = path.join(workDir, '.brt-home')
    const bundlePath = path.join(workDir, 'bundle.cjs')
    fs.writeFileSync(bundlePath, 'module.exports = {}')
    const command = makeCommand(workDir, { profile: 'default', botpressHome, local: false })
    ;(command as any).readProfileFromFS = vi.fn().mockResolvedValue({
      apiUrl: 'https://cloud.example',
      workspaceId: 'ws_123',
      token: 'pat',
    })
    ;(command as any)._syncAdkTables = vi.fn().mockResolvedValue(undefined)
    ;(command as any)._writeAdkLastDeploy = vi.fn()
    const generateSpy = vi
      .spyOn(adkBundle, 'generateAgentBot')
      .mockResolvedValue(path.join(workDir, '.adk', 'bot'))
    vi.spyOn(adkBundle, 'normalizeBundle').mockReturnValue(bundlePath)
    vi.spyOn(BuildCommand.prototype, 'run').mockResolvedValue(undefined)
    vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue(undefined)
    vi.spyOn(CloudapiClient.prototype, 'provisionBot').mockResolvedValue({
      botId: 77,
      workspaceId: 'ws_123' as any,
      apiKey: 'bot_key',
    })

    await (command as any)._deployAdkBundle()

    expect(generateSpy).toHaveBeenCalledWith(workDir, expect.any(Function), {
      adkCommand: 'adk-build',
      configTarget: {
        environment: 'prod',
        botId: '77',
        credentials: { token: 'pat', apiUrl: 'https://cloud.example', workspaceId: 'ws_123' },
      },
    })
    expect(JSON.stringify(generateSpy.mock.calls)).not.toContain('999')
    expect(JSON.stringify(generateSpy.mock.calls)).not.toContain('dev_must_not_be_used')
  })

  it('loads the prod dependency snapshot mode for table sync', async () => {
    const load = vi.fn().mockResolvedValue({
      tables: [],
      agentInfo: { botId: '42', workspaceId: 'ws_123', apiUrl: 'https://cloud.example' },
    })
    vi.spyOn(adkBundle, 'loadAdkTableManager').mockResolvedValue({
      AgentProject: { load },
      TableManager: class TableManager {},
    } as any)
    const command = makeCommand(workDir)

    await (command as any)._syncAdkTables(
      workDir,
      'https://cloud.example',
      '42',
      { token: 'pat', apiUrl: 'https://cloud.example', workspaceId: 'ws_123' },
      { botId: '42', workspaceId: 'ws_123', apiUrl: 'https://cloud.example' }
    )

    expect(load).toHaveBeenCalledWith(workDir, {
      adkCommand: 'adk-build',
      configTarget: {
        environment: 'prod',
        botId: '42',
        credentials: { token: 'pat', apiUrl: 'https://cloud.example', workspaceId: 'ws_123' },
      },
    })
  })
})
