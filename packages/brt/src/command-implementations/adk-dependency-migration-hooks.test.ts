import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const migrationToolsMock = vi.hoisted(() => ({ load: vi.fn() }))

vi.mock('../adk-bundle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../adk-bundle')>()),
  loadAgentRecurringEvents: vi.fn(async () => ({})),
  loadAdkMigrationTools: migrationToolsMock.load,
}))

import * as adkBundle from '../adk-bundle'
import * as adkDevId from '../adk-dev-id'
import * as toolchainContract from '../toolchain-contract'
import { CloudapiClient } from '../api/cloudapi-client'
import { Logger } from '../logger'
import * as utils from '../utils'
import { DeployCommand } from './deploy-command'
import { DevCommand } from './dev-command'

const CLOUD_PROFILE = {
  apiUrl: 'https://cloud.example',
  workspaceId: 'workspace_cloud',
  token: 'profile_pat',
}
const LOCAL_PROFILE = {
  apiUrl: 'http://local.example',
  workspaceId: 'workspace_local',
  token: 'local_profile_pat',
}

function devBot(runtimeBotId: string, targetBotId: string) {
  return {
    id: runtimeBotId,
    dev: true,
    tags: { 'botruntime.devTargetBotId': targetBotId },
    integrations: {},
    plugins: {},
    devReadiness: {
      schemaVersion: 1,
      integrations: { authority: 'authoritative', source: 'integration_installation' },
      plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
      lastDevDeployment: { authority: 'unknown', reason: 'not_required_by_hook_test' },
    },
  }
}

function writeVerifiedBundle(
  workDir: string,
  code: string,
  target: { apiUrl: string; workspaceId: string; botId: string }
): string {
  const bundlePath = path.join(workDir, '.brt', 'dist', 'index.cjs')
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true })
  fs.writeFileSync(bundlePath, code)
  adkBundle.writeBundleProvenance(bundlePath, target, code)
  toolchainContract.writePlatformToolchainContract(
    workDir,
    toolchainContract.inspectPlatformToolchain(workDir),
    { bundleSha256: adkBundle.sha256(code) }
  )
  return bundlePath
}

function mockMigrationLoader(migrateFromConfig: ReturnType<typeof vi.fn>) {
  migrationToolsMock.load.mockResolvedValue({ migrateFromConfig })
  return migrationToolsMock.load
}

function makeDevCommand(options: {
  workDir: string
  botpressHome: string
  apiFactory: { newClient: ReturnType<typeof vi.fn> }
  local?: boolean
  tunnelId?: string
}): DevCommand {
  if (!fs.existsSync(path.join(options.workDir, 'agent.json'))) {
    fs.writeFileSync(
      path.join(options.workDir, 'agent.json'),
      JSON.stringify({
        botId: '3',
        apiUrl: CLOUD_PROFILE.apiUrl,
        workspaceId: CLOUD_PROFILE.workspaceId,
      })
    )
  }
  const command = new DevCommand(options.apiFactory as any, {} as any, new Logger(), {
    workDir: options.workDir,
    botpressHome: options.botpressHome,
    profile: options.local ? 'local' : 'selected',
    apiUrl: undefined,
    workspaceId: undefined,
    token: undefined,
    check: false,
    adk: false,
    local: Boolean(options.local),
    watch: false,
    tunnelId: options.tunnelId,
    tunnelUrl: 'https://botruntime.ru',
    noSecretCaching: false,
  } as any)
  ;(command as any).readProfileFromFS = vi.fn(async () =>
    options.local ? LOCAL_PROFILE : CLOUD_PROFILE
  )
  return command
}

function makeDeployCommand(options: {
  workDir: string
  botpressHome: string
  apiFactory: { newClient: ReturnType<typeof vi.fn> }
  local?: boolean
  noBuild?: boolean
  botId?: string
}): DeployCommand {
  const command = new DeployCommand(options.apiFactory as any, {} as any, new Logger(), {
    workDir: options.workDir,
    botpressHome: options.botpressHome,
    profile: options.local ? 'local' : 'selected',
    adk: true,
    watch: false,
    local: Boolean(options.local),
    noBuild: Boolean(options.noBuild),
    botId: options.botId,
  } as any)
  ;(command as any).readProfileFromFS = vi.fn(async () =>
    options.local ? LOCAL_PROFILE : CLOUD_PROFILE
  )
  ;(command as any)._syncAdkTables = vi.fn(async () => undefined)
  ;(command as any)._writeAdkLastDeploy = vi.fn()
  return command
}

describe('agent command dependency migration hooks', () => {
  let workDir: string
  let botpressHome: string

  beforeEach(() => {
    migrationToolsMock.load.mockReset()
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-adk-migration-hook-'))
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-adk-migration-home-'))
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
    vi.spyOn(toolchainContract, 'assertPlatformToolchainCompatible').mockImplementation(() => undefined)
  })

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true })
    fs.rmSync(botpressHome, { recursive: true, force: true })
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('normal dev preserves local-stack coordinates and migrates attested dev before generation', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        apiUrl: LOCAL_PROFILE.apiUrl,
        workspaceId: LOCAL_PROFILE.workspaceId,
        botId: 'local_prod_bot',
        devId: 'dev_runtime',
        devTargetBotId: '42',
      })
    )
    const cloudClient = {
      getBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
      createBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
    }
    const apiFactory = { newClient: vi.fn(() => ({ client: cloudClient })) }
    const migrationFailure = new Error('dependency migration gate')
    const migrateFromConfig = vi.fn(async () => {
      throw migrationFailure
    })
    mockMigrationLoader(migrateFromConfig)
    const generate = vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(path.join(workDir, '.adk', 'bot'))
    const nested = vi.spyOn(DevCommand.prototype, 'run').mockResolvedValue(undefined)
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    const command = makeDevCommand({ workDir, botpressHome, apiFactory })

    await expect((command as any)._runAgentTunnelDev()).rejects.toBe(migrationFailure)

    expect(migrateFromConfig).toHaveBeenCalledWith({
      projectPath: workDir,
      client: cloudClient,
      target: {
        env: 'dev',
        apiUrl: CLOUD_PROFILE.apiUrl,
        workspaceId: CLOUD_PROFILE.workspaceId,
        botId: '42',
      },
      runtimeBotId: 'dev_runtime',
      authority: {
        source: 'agentLocalDev',
        coordinates: {
          source: 'attested',
          apiUrl: CLOUD_PROFILE.apiUrl,
          workspaceId: CLOUD_PROFILE.workspaceId,
        },
      },
    })
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf8'))).toEqual({
      botId: 'local_prod_bot',
      workspaceId: LOCAL_PROFILE.workspaceId,
      apiUrl: LOCAL_PROFILE.apiUrl,
      devId: 'dev_runtime',
      devTargetBotId: '42',
      devApiUrl: CLOUD_PROFILE.apiUrl,
      devWorkspaceId: CLOUD_PROFILE.workspaceId,
    })
    expect(generate).not.toHaveBeenCalled()
    expect(nested).not.toHaveBeenCalled()
  })

  it('fresh normal dev writes only exact dev IDs before attested migration and never generates on failure', async () => {
    const runtimeBotId = 'dev_fresh'
    const cloudClient = {
      getBot: vi.fn(),
      createBot: vi.fn(async () => ({ bot: devBot(runtimeBotId, '84') })),
    }
    const apiFactory = { newClient: vi.fn(() => ({ client: cloudClient })) }
    const migrationFailure = new Error('fresh dependency migration gate')
    const migrateFromConfig = vi.fn(async () => {
      expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf8'))).toEqual({
        devId: runtimeBotId,
        devTargetBotId: '84',
        devApiUrl: CLOUD_PROFILE.apiUrl,
        devWorkspaceId: CLOUD_PROFILE.workspaceId,
      })
      throw migrationFailure
    })
    mockMigrationLoader(migrateFromConfig)
    const generate = vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(path.join(workDir, '.adk', 'bot'))
    vi.spyOn(DevCommand.prototype, 'run').mockResolvedValue(undefined)
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    const command = makeDevCommand({ workDir, botpressHome, apiFactory, tunnelId: runtimeBotId })

    await expect((command as any)._runAgentTunnelDev()).rejects.toBe(migrationFailure)

    expect(cloudClient.createBot).toHaveBeenCalledOnce()
    expect(migrateFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ env: 'dev', botId: '84' }),
        runtimeBotId,
        authority: expect.objectContaining({
          source: 'agentLocalDev',
          coordinates: expect.objectContaining({ source: 'attested' }),
        }),
      })
    )
    expect(generate).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'cloud to local',
      local: true,
      cached: { ...CLOUD_PROFILE, targetBotId: '42' },
      selected: { ...LOCAL_PROFILE, targetBotId: '84' },
    },
    {
      label: 'local to cloud',
      local: false,
      cached: { ...LOCAL_PROFILE, targetBotId: '84' },
      selected: { ...CLOUD_PROFILE, targetBotId: '42' },
    },
  ])(
    '$label never compares or migrates the foreign numeric target when both stacks expose the same runtime id',
    async ({ local, cached, selected }) => {
      const runtimeBotId = 'shared-runtime'
      fs.writeFileSync(
        path.join(workDir, 'agent.local.json'),
        JSON.stringify({
          apiUrl: LOCAL_PROFILE.apiUrl,
          workspaceId: LOCAL_PROFILE.workspaceId,
          devId: runtimeBotId,
          devTargetBotId: cached.targetBotId,
          devApiUrl: cached.apiUrl,
          devWorkspaceId: cached.workspaceId,
        })
      )
      const selectedClient = {
        getBot: vi.fn(async () => ({ bot: devBot(runtimeBotId, selected.targetBotId) })),
        createBot: vi.fn(async () => ({ bot: devBot(runtimeBotId, selected.targetBotId) })),
      }
      const apiFactory = { newClient: vi.fn(() => ({ client: selectedClient })) }
      const migrationFailure = new Error(`selected ${selected.targetBotId} migration gate`)
      const migrateFromConfig = vi.fn(async () => {
        throw migrationFailure
      })
      mockMigrationLoader(migrateFromConfig)
      vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(path.join(workDir, '.adk', 'bot'))
      vi.spyOn(DevCommand.prototype, 'run').mockResolvedValue(undefined)
      vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
      vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
      const command = makeDevCommand({ workDir, botpressHome, apiFactory, local, tunnelId: runtimeBotId })

      await expect((command as any)._runAgentTunnelDev()).rejects.toBe(migrationFailure)

      expect(selectedClient.getBot).toHaveBeenCalledWith({ id: runtimeBotId })
      expect(selectedClient.createBot).toHaveBeenCalledWith({
        dev: true,
        url: `https://botruntime.ru/${runtimeBotId}`,
        tags: { 'botruntime.productionBotId': '3' },
      })
      expect(migrateFromConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          target: {
            env: 'dev',
            apiUrl: selected.apiUrl,
            workspaceId: selected.workspaceId,
            botId: selected.targetBotId,
          },
          runtimeBotId,
        })
      )
      expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf8'))).toMatchObject({
        devId: runtimeBotId,
        devTargetBotId: selected.targetBotId,
        devApiUrl: selected.apiUrl,
        devWorkspaceId: selected.workspaceId,
      })
    }
  )

  it('dev --local proves coordinates from agent.local and migrates before generation', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        apiUrl: LOCAL_PROFILE.apiUrl,
        workspaceId: LOCAL_PROFILE.workspaceId,
        devId: 'dev_local',
        devTargetBotId: '91',
      })
    )
    const localClient = {
      getBot: vi.fn(async () => ({ bot: devBot('dev_local', '91') })),
      createBot: vi.fn(async () => ({ bot: devBot('dev_local', '91') })),
    }
    const apiFactory = { newClient: vi.fn(() => ({ client: localClient })) }
    const migrationFailure = new Error('local dev dependency migration gate')
    const migrateFromConfig = vi.fn(async () => {
      throw migrationFailure
    })
    mockMigrationLoader(migrateFromConfig)
    const generate = vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(path.join(workDir, '.adk', 'bot'))
    vi.spyOn(DevCommand.prototype, 'run').mockResolvedValue(undefined)
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    const command = makeDevCommand({ workDir, botpressHome, apiFactory, local: true })

    await expect((command as any)._runAgentTunnelDev()).rejects.toBe(migrationFailure)

    expect(migrateFromConfig).toHaveBeenCalledWith({
      projectPath: workDir,
      client: localClient,
      target: {
        env: 'dev',
        apiUrl: LOCAL_PROFILE.apiUrl,
        workspaceId: LOCAL_PROFILE.workspaceId,
        botId: '91',
      },
      runtimeBotId: 'dev_local',
      authority: { source: 'agentLocalDev', coordinates: { source: 'link' } },
    })
    expect(generate).not.toHaveBeenCalled()
  })

  it('coalesces concurrent post-deploy snapshot callbacks into one refresh promise', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: 'dev_runtime',
        devTargetBotId: '42',
        devApiUrl: CLOUD_PROFILE.apiUrl,
        devWorkspaceId: CLOUD_PROFILE.workspaceId,
      })
    )
    const cloudClient = {
      getBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
      createBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
    }
    const apiFactory = { newClient: vi.fn(() => ({ client: cloudClient })) }
    mockMigrationLoader(vi.fn(async () => undefined))
    vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(path.join(workDir, '.adk', 'bot'))
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    const command = makeDevCommand({ workDir, botpressHome, apiFactory })
    const refresh = vi.spyOn(command as any, '_refreshAgentDevSnapshot').mockResolvedValue(undefined)
    vi.spyOn(DevCommand.prototype, 'run').mockImplementation(async function (this: DevCommand) {
      const callback = (this as any)._afterInitialDevBotDeploy as () => Promise<void>
      await Promise.all([callback(), callback()])
    })

    await (command as any)._runAgentTunnelDev()

    expect(refresh).toHaveBeenCalledOnce()
  })

  it('dev --check returns through its read-only branch without loading migration tools', async () => {
    const loader = migrationToolsMock.load
    const command = makeDevCommand({
      workDir,
      botpressHome,
      apiFactory: { newClient: vi.fn() },
    })
    ;(command as any).argv.check = true
    ;(command as any)._runDevCheck = vi.fn(async () => undefined)

    await command.run()

    expect(loader).not.toHaveBeenCalled()
  })

  it('classic dev reaches its classic client path without loading migration tools', async () => {
    fs.unlinkSync(path.join(workDir, 'agent.config.ts'))
    const apiFactory = { newClient: vi.fn() }
    const command = makeDevCommand({ workDir, botpressHome, apiFactory })
    const classicReached = new Error('classic dev reached')
    ;(command as any).ensureLoginAndCreateClient = vi.fn(async () => {
      throw classicReached
    })

    await expect(command.run()).rejects.toBe(classicReached)

    expect(migrationToolsMock.load).not.toHaveBeenCalled()
  })

  it('normal linked deploy migrates prod before build and blocks every downstream write on failure', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({
        botId: '42',
        apiUrl: CLOUD_PROFILE.apiUrl,
        workspaceId: CLOUD_PROFILE.workspaceId,
      })
    )
    const migrationClient = { getBot: vi.fn(), updateBot: vi.fn() }
    const apiFactory = { newClient: vi.fn(() => ({ client: migrationClient })) }
    const migrationFailure = new Error('prod dependency migration gate')
    const migrateFromConfig = vi.fn(async () => {
      throw migrationFailure
    })
    mockMigrationLoader(migrateFromConfig)
    const command = makeDeployCommand({ workDir, botpressHome, apiFactory })
    const build = vi.fn(async () => {
      throw new Error('build ran before migration')
    })
    ;(command as any)._buildAdkBundle = build
    const put = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toBe(migrationFailure)

    expect(migrateFromConfig).toHaveBeenCalledWith({
      projectPath: workDir,
      client: migrationClient,
      target: {
        env: 'prod',
        apiUrl: CLOUD_PROFILE.apiUrl,
        workspaceId: CLOUD_PROFILE.workspaceId,
        botId: '42',
      },
      authority: { source: 'agent' },
    })
    expect(build).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect((command as any)._syncAdkTables).not.toHaveBeenCalled()
  })

  it('fresh deploy provisions a recoverable prod link, then migrates before build or PUT', async () => {
    const migrationClient = { getBot: vi.fn(), updateBot: vi.fn() }
    const apiFactory = { newClient: vi.fn(() => ({ client: migrationClient })) }
    const migrationFailure = new Error('fresh prod dependency migration gate')
    const migrateFromConfig = vi.fn(async () => {
      expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8'))).toEqual({
        botId: '77',
        workspaceId: CLOUD_PROFILE.workspaceId,
        apiUrl: CLOUD_PROFILE.apiUrl,
      })
      throw migrationFailure
    })
    mockMigrationLoader(migrateFromConfig)
    vi.spyOn(CloudapiClient.prototype, 'provisionBot').mockResolvedValue({
      botId: 77,
      workspaceId: CLOUD_PROFILE.workspaceId as any,
      apiKey: 'per_bot_key',
    })
    const command = makeDeployCommand({ workDir, botpressHome, apiFactory })
    const build = vi.fn(async () => {
      throw new Error('build ran before migration')
    })
    ;(command as any)._buildAdkBundle = build
    const put = vi.spyOn(CloudapiClient.prototype, 'putBundle')

    await expect((command as any)._deployAdkBundle()).rejects.toBe(migrationFailure)

    expect(migrateFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ env: 'prod', botId: '77' }),
        authority: { source: 'agent' },
      })
    )
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(true)
    expect(build).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect((command as any)._syncAdkTables).not.toHaveBeenCalled()
  })

  it('valid noBuild with argv-only bot id uses explicit authority before PUT and does not persist a link', async () => {
    const target = { ...CLOUD_PROFILE, botId: '55' }
    writeVerifiedBundle(workDir, 'verified explicit bundle', target)
    const migrationClient = { getBot: vi.fn(), updateBot: vi.fn() }
    const apiFactory = { newClient: vi.fn(() => ({ client: migrationClient })) }
    const order: string[] = []
    const migrateFromConfig = vi.fn(async () => {
      order.push('migration')
    })
    mockMigrationLoader(migrateFromConfig)
    const command = makeDeployCommand({
      workDir,
      botpressHome,
      apiFactory,
      noBuild: true,
      botId: target.botId,
    })
    vi.spyOn(CloudapiClient.prototype, 'putBundle').mockImplementation(async () => {
      order.push('put')
      return {} as any
    })

    await (command as any)._deployAdkBundle()

    expect(order).toEqual(['migration', 'put'])
    expect(migrateFromConfig).toHaveBeenCalledWith({
      projectPath: workDir,
      client: migrationClient,
      target: { env: 'prod', apiUrl: target.apiUrl, workspaceId: target.workspaceId, botId: target.botId },
      authority: { source: 'explicit', botId: target.botId },
    })
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'agent.local.json'))).toBe(false)
  })

  it('local noBuild migrates the prod snapshot through agentLocalBot and preserves agent.json', async () => {
    const prodBytes = JSON.stringify({
      botId: 'prod_bot',
      apiUrl: CLOUD_PROFILE.apiUrl,
      workspaceId: CLOUD_PROFILE.workspaceId,
    })
    fs.writeFileSync(path.join(workDir, 'agent.json'), prodBytes)
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        botId: '202',
        apiUrl: LOCAL_PROFILE.apiUrl,
        workspaceId: LOCAL_PROFILE.workspaceId,
        devId: 'dev_opaque',
        devTargetBotId: '303',
      })
    )
    writeVerifiedBundle(workDir, 'verified local bundle', { ...LOCAL_PROFILE, botId: '202' })
    const migrationClient = { getBot: vi.fn(), updateBot: vi.fn() }
    const apiFactory = { newClient: vi.fn(() => ({ client: migrationClient })) }
    const order: string[] = []
    const migrateFromConfig = vi.fn(async () => {
      order.push('migration')
    })
    mockMigrationLoader(migrateFromConfig)
    const command = makeDeployCommand({ workDir, botpressHome, apiFactory, local: true, noBuild: true })
    vi.spyOn(CloudapiClient.prototype, 'putBundle').mockImplementation(async () => {
      order.push('put')
      return {} as any
    })

    await (command as any)._deployAdkBundle()

    expect(order).toEqual(['migration', 'put'])
    expect(migrateFromConfig).toHaveBeenCalledWith({
      projectPath: workDir,
      client: migrationClient,
      target: {
        env: 'prod',
        apiUrl: LOCAL_PROFILE.apiUrl,
        workspaceId: LOCAL_PROFILE.workspaceId,
        botId: '202',
      },
      authority: { source: 'agentLocalBot' },
    })
    expect(fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8')).toBe(prodBytes)
  })

  it('explicit noBuild target differing from agent.json uses explicit proof and preserves prod link bytes', async () => {
    const agentBytes = JSON.stringify({
      botId: '42',
      apiUrl: CLOUD_PROFILE.apiUrl,
      workspaceId: CLOUD_PROFILE.workspaceId,
    })
    fs.writeFileSync(path.join(workDir, 'agent.json'), agentBytes)
    writeVerifiedBundle(workDir, 'explicit prod override', { ...CLOUD_PROFILE, botId: '55' })
    const migrationClient = { getBot: vi.fn(), updateBot: vi.fn() }
    const apiFactory = { newClient: vi.fn(() => ({ client: migrationClient })) }
    const migrateFromConfig = vi.fn(async () => undefined)
    mockMigrationLoader(migrateFromConfig)
    const command = makeDeployCommand({ workDir, botpressHome, apiFactory, noBuild: true, botId: '55' })
    vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue({} as any)

    await (command as any)._deployAdkBundle()

    expect(migrateFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ env: 'prod', botId: '55' }),
        authority: { source: 'explicit', botId: '55' },
      })
    )
    expect(fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8')).toBe(agentBytes)
  })

  it('explicit local noBuild target differing from agent.local uses explicit proof and preserves local bytes', async () => {
    const localBytes = JSON.stringify({
      botId: '202',
      apiUrl: LOCAL_PROFILE.apiUrl,
      workspaceId: LOCAL_PROFILE.workspaceId,
      devId: 'dev_opaque',
      devTargetBotId: '303',
    })
    fs.writeFileSync(path.join(workDir, 'agent.local.json'), localBytes)
    writeVerifiedBundle(workDir, 'explicit local override', { ...LOCAL_PROFILE, botId: '404' })
    const migrationClient = { getBot: vi.fn(), updateBot: vi.fn() }
    const apiFactory = { newClient: vi.fn(() => ({ client: migrationClient })) }
    const migrateFromConfig = vi.fn(async () => undefined)
    mockMigrationLoader(migrateFromConfig)
    const command = makeDeployCommand({
      workDir,
      botpressHome,
      apiFactory,
      local: true,
      noBuild: true,
      botId: '404',
    })
    vi.spyOn(CloudapiClient.prototype, 'putBundle').mockResolvedValue({} as any)

    await (command as any)._deployAdkBundle()

    expect(migrateFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ env: 'prod', botId: '404' }),
        authority: { source: 'explicit', botId: '404' },
      })
    )
    expect(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf8')).toBe(localBytes)
  })

  it('invalid noBuild stops before migration dynamic-load, provisioning, clients, or local writes', async () => {
    const bundlePath = path.join(workDir, '.brt', 'dist', 'index.cjs')
    fs.mkdirSync(path.dirname(bundlePath), { recursive: true })
    fs.writeFileSync(bundlePath, 'unbound bundle')
    const apiFactory = { newClient: vi.fn() }
    const command = makeDeployCommand({ workDir, botpressHome, apiFactory, noBuild: true })
    const provision = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
    const put = vi.spyOn(CloudapiClient.prototype, 'putBundle')
    const build = vi.spyOn(adkBundle, 'generateAgentBot')

    await expect((command as any)._deployAdkBundle()).rejects.toThrow(/--noBuild.*linked|linked.*--noBuild/i)

    expect(migrationToolsMock.load).not.toHaveBeenCalled()
    expect(apiFactory.newClient).not.toHaveBeenCalled()
    expect(provision).not.toHaveBeenCalled()
    expect(build).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'agent.local.json'))).toBe(false)
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
  })

  it.each(['corrupt', 'foreign'] as const)(
    'linked noBuild with %s provenance stops before the migration loader or any write',
    async (variant) => {
      const agentBytes = JSON.stringify({
        botId: '42',
        apiUrl: CLOUD_PROFILE.apiUrl,
        workspaceId: CLOUD_PROFILE.workspaceId,
      })
      fs.writeFileSync(path.join(workDir, 'agent.json'), agentBytes)
      const bundlePath = writeVerifiedBundle(
        workDir,
        'invalid provenance bundle',
        variant === 'foreign' ? { ...CLOUD_PROFILE, botId: '999' } : { ...CLOUD_PROFILE, botId: '42' }
      )
      if (variant === 'corrupt') fs.writeFileSync(`${bundlePath}.provenance.json`, '{broken')
      const apiFactory = { newClient: vi.fn() }
      const command = makeDeployCommand({ workDir, botpressHome, apiFactory, noBuild: true })
      const provision = vi.spyOn(CloudapiClient.prototype, 'provisionBot')
      const put = vi.spyOn(CloudapiClient.prototype, 'putBundle')

      await expect((command as any)._deployAdkBundle()).rejects.toThrow(/provenance|rebuild without --noBuild/i)

      expect(migrationToolsMock.load).not.toHaveBeenCalled()
      expect(apiFactory.newClient).not.toHaveBeenCalled()
      expect(provision).not.toHaveBeenCalled()
      expect(put).not.toHaveBeenCalled()
      expect(fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8')).toBe(agentBytes)
      expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
    }
  )

  it('classic deploy reaches its classic login path without loading migration tools', async () => {
    const apiFactory = { newClient: vi.fn() }
    const command = makeDeployCommand({ workDir, botpressHome, apiFactory })
    ;(command as any).argv.adk = false
    const classicReached = new Error('classic deploy reached')
    ;(command as any).ensureLoginAndCreateClient = vi.fn(async () => {
      throw classicReached
    })

    await expect(command.run()).rejects.toBe(classicReached)

    expect(migrationToolsMock.load).not.toHaveBeenCalled()
  })

  it('filters dependency source changes by the selected snapshot env and excludes migration internals', () => {
    const changed = (relative: string, dependencyEnv: 'dev' | 'prod') =>
      (adkBundle.isAgentSourceChange as any)(workDir, path.join(workDir, relative), { dependencyEnv })

    expect(changed('.adk/dependencies/dev.json', 'dev')).toBe(true)
    expect(changed('.adk/dependencies/dev.json', 'prod')).toBe(false)
    expect(changed('.adk/dependencies/prod.json', 'prod')).toBe(true)
    expect(changed('.adk/dependencies/prod.json', 'dev')).toBe(false)
    for (const internal of [
      '.adk/dependencies/migration.json',
      '.adk/dependencies/migration.lock',
      '.adk/dependencies/migration.dev.pending.json',
      '.adk/dependencies/migration.prod.pending.json.tmp-123',
    ]) {
      expect(changed(internal, 'dev')).toBe(false)
      expect(changed(internal, 'prod')).toBe(false)
    }
  })

  it('deploy watch reacts to prod snapshot only, not dev snapshot or migration artifacts', async () => {
    const command = makeDeployCommand({
      workDir,
      botpressHome,
      apiFactory: { newClient: vi.fn() },
    })
    ;(command as any).argv.watch = true
    const deploy = vi.fn(async () => undefined)
    ;(command as any)._deployAdkBundle = deploy
    vi.spyOn(utils.filewatcher.FileWatcher, 'watch').mockImplementation(async (dir, onChange) => ({
      wait: async () => {
        for (const relative of [
          '.adk/dependencies/dev.json',
          '.adk/dependencies/migration.json',
          '.adk/dependencies/migration.lock',
          '.adk/dependencies/migration.prod.pending.json',
          '.adk/dependencies/prod.json',
        ]) {
          await onChange([{ type: 'update', path: path.join(dir, relative) }])
        }
      },
      close: vi.fn(async () => undefined),
    }) as any)

    await command.run()

    expect(deploy).toHaveBeenCalledTimes(2)
  })

  it('dev watch regenerates for dev snapshot only, not prod snapshot or migration artifacts', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ devId: 'dev_runtime', devTargetBotId: '42' })
    )
    const cloudClient = {
      getBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
      createBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
    }
    const apiFactory = { newClient: vi.fn(() => ({ client: cloudClient })) }
    mockMigrationLoader(vi.fn(async () => undefined))
    const devSnapshotPath = path.join(workDir, '.adk', 'dependencies', 'dev.json')
    fs.mkdirSync(path.dirname(devSnapshotPath), { recursive: true })
    fs.writeFileSync(devSnapshotPath, JSON.stringify({ integrations: { chat: { version: '1.0.0', enabled: true } } }))
    const generate = vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(path.join(workDir, '.adk', 'bot'))
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    vi.spyOn(DevCommand.prototype, 'run').mockResolvedValue(undefined)
    vi.spyOn(utils.filewatcher.FileWatcher, 'watch').mockImplementation(async (dir, onChange) => {
      for (const relative of [
        '.adk/dependencies/prod.json',
        '.adk/dependencies/migration.json',
        '.adk/dependencies/migration.lock',
        '.adk/dependencies/migration.dev.pending.json',
        '.adk/dependencies/dev.json',
      ]) {
        if (relative === '.adk/dependencies/dev.json') {
          fs.writeFileSync(
            devSnapshotPath,
            JSON.stringify({ integrations: { chat: { version: '1.1.0', enabled: true } } })
          )
        }
        await onChange([{ type: 'update', path: path.join(dir, relative) }])
      }
      return { close: vi.fn(async () => undefined) } as any
    })
    const command = makeDevCommand({ workDir, botpressHome, apiFactory })
    ;(command as any).argv.watch = true

    await (command as any)._runAgentTunnelDev()

    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('dev watch ignores a snapshot refresh that only changes volatile timestamps', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ devId: 'dev_runtime', devTargetBotId: '42' })
    )
    const snapshotPath = path.join(workDir, '.adk', 'dependencies', 'dev.json')
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
    const snapshot = {
      version: 2,
      env: 'dev',
      target: { apiUrl: CLOUD_PROFILE.apiUrl, workspaceId: CLOUD_PROFILE.workspaceId, botId: '42' },
      fetchedAt: '2030-01-01T00:00:00.000Z',
      botUpdatedAt: '2030-01-01T00:00:00.000Z',
      integrations: { chat: { name: 'botruntime/chat', version: '1.0.0', enabled: true } },
      plugins: {},
    }
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot))

    const cloudClient = {
      getBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
      createBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
    }
    const apiFactory = { newClient: vi.fn(() => ({ client: cloudClient })) }
    mockMigrationLoader(vi.fn(async () => undefined))
    const generate = vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(path.join(workDir, '.adk', 'bot'))
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    vi.spyOn(DevCommand.prototype, 'run').mockResolvedValue(undefined)
    vi.spyOn(utils.filewatcher.FileWatcher, 'watch').mockImplementation(async (dir, onChange) => {
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify({
          ...snapshot,
          fetchedAt: '2030-01-02T00:00:00.000Z',
          botUpdatedAt: '2030-01-02T00:00:00.000Z',
        })
      )
      await onChange([{ type: 'update', path: path.join(dir, '.adk', 'dependencies', 'dev.json') }])
      return { close: vi.fn(async () => undefined) } as any
    })
    const command = makeDevCommand({ workDir, botpressHome, apiFactory })
    ;(command as any).argv.watch = true

    await (command as any)._runAgentTunnelDev()

    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('does not commit a queued snapshot fingerprint until regeneration succeeds', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ devId: 'dev_runtime', devTargetBotId: '42' })
    )
    const snapshotPath = path.join(workDir, '.adk', 'dependencies', 'dev.json')
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
    const snapshot = {
      version: 2,
      env: 'dev',
      target: { apiUrl: CLOUD_PROFILE.apiUrl, workspaceId: CLOUD_PROFILE.workspaceId, botId: '42' },
      fetchedAt: '2030-01-01T00:00:00.000Z',
      botUpdatedAt: '2030-01-01T00:00:00.000Z',
      integrations: { chat: { name: 'botruntime/chat', version: '1.0.0', enabled: true } },
      plugins: {},
    }
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot))

    const cloudClient = {
      getBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
      createBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
    }
    const apiFactory = { newClient: vi.fn(() => ({ client: cloudClient })) }
    mockMigrationLoader(vi.fn(async () => undefined))
    let rejectRegeneration!: (reason: Error) => void
    const generate = vi
      .spyOn(adkBundle, 'generateAgentBot')
      .mockResolvedValueOnce(path.join(workDir, '.adk', 'bot'))
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectRegeneration = reject
          })
      )
      .mockResolvedValue(path.join(workDir, '.adk', 'bot'))
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    vi.spyOn(DevCommand.prototype, 'run').mockResolvedValue(undefined)
    vi.spyOn(utils.filewatcher.FileWatcher, 'watch').mockImplementation(async (dir, onChange) => {
      const event = [{ type: 'update' as const, path: path.join(dir, '.adk', 'dependencies', 'dev.json') }]
      const changedSnapshot = {
        ...snapshot,
        integrations: { chat: { name: 'botruntime/chat', version: '1.1.0', enabled: true } },
      }
      fs.writeFileSync(snapshotPath, JSON.stringify(changedSnapshot))
      const first = onChange(event)
      await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2))

      fs.writeFileSync(snapshotPath, JSON.stringify({ ...changedSnapshot, fetchedAt: '2030-01-02T00:00:00.000Z' }))
      const concurrent = onChange(event)
      await Promise.resolve()
      rejectRegeneration(new Error('regeneration failed'))
      await Promise.all([first, concurrent])

      fs.writeFileSync(snapshotPath, JSON.stringify({ ...changedSnapshot, fetchedAt: '2030-01-03T00:00:00.000Z' }))
      await onChange(event)
      return { close: vi.fn(async () => undefined) } as any
    })
    const command = makeDevCommand({ workDir, botpressHome, apiFactory })
    ;(command as any).argv.watch = true

    await (command as any)._runAgentTunnelDev()

    expect(generate).toHaveBeenCalledTimes(3)
  })

  it('refreshes the parent dev snapshot at most once after repeated nested deploy callbacks', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ devId: 'dev_runtime', devTargetBotId: '42' })
    )
    const cloudClient = {
      getBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
      createBot: vi.fn(async () => ({ bot: devBot('dev_runtime', '42') })),
    }
    const apiFactory = { newClient: vi.fn(() => ({ client: cloudClient })) }
    mockMigrationLoader(vi.fn(async () => undefined))
    vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(path.join(workDir, '.adk', 'bot'))
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    const refreshCompletedDependencySnapshot = vi.fn(async () => ({ status: 'refreshed' as const }))
    vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools').mockResolvedValue({
      refreshCompletedDependencySnapshot: refreshCompletedDependencySnapshot as any,
    })
    vi.spyOn(DevCommand.prototype, 'run').mockImplementation(async function (this: DevCommand) {
      const refresh = (this as any)._afterInitialDevBotDeploy
      await refresh()
      await refresh()
    })
    const command = makeDevCommand({ workDir, botpressHome, apiFactory })

    await (command as any)._runAgentTunnelDev()

    expect(refreshCompletedDependencySnapshot).toHaveBeenCalledOnce()
  })
})
