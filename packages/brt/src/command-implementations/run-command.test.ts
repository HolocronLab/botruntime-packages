import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { schemas } from '../config'
import { Logger } from '../logger'

const runnerMocks = vi.hoisted(() => ({
  constructors: [] as Array<Record<string, unknown>>,
  run: vi.fn(async (..._args: unknown[]) => 0),
}))
const envMocks = vi.hoisted(() => ({
  fetchDevConfigVars: vi.fn(async () => ({ REMOTE_SECRET: 'sealed' })),
  buildDevWorkerEnvironment: vi.fn(() => ({ SCRIPT_ENV: 'ready' })),
}))
const commandMocks = vi.hoisted(() => ({
  addConstructors: [] as Array<Record<string, unknown>>,
  addRun: vi.fn(async () => undefined),
  buildConstructors: [] as Array<Record<string, unknown>>,
  buildContexts: [] as unknown[],
  buildRun: vi.fn(async () => undefined),
}))

vi.mock('@holocronlab/botruntime-adk', () => ({
  ScriptRunner: class ScriptRunner {
    public constructor(options: Record<string, unknown>) {
      runnerMocks.constructors.push(options)
    }

    public run(...args: unknown[]) {
      return runnerMocks.run(...args)
    }
  },
}))
vi.mock('../dev-worker-env', () => envMocks)
vi.mock('./add-command', () => ({
  AddCommand: class AddCommand {
    public constructor(
      _api: unknown,
      _prompt: unknown,
      _logger: unknown,
      argv: Record<string, unknown>
    ) {
      commandMocks.addConstructors.push(argv)
    }

    public run() {
      return commandMocks.addRun()
    }
  },
}))
vi.mock('./build-command', () => ({
  BuildCommand: class BuildCommand {
    public constructor(
      _api: unknown,
      _prompt: unknown,
      _logger: unknown,
      argv: Record<string, unknown>
    ) {
      commandMocks.buildConstructors.push(argv)
    }

    public setProjectContext(context: unknown) {
      commandMocks.buildContexts.push(context)
      return this
    }

    public run() {
      return commandMocks.buildRun()
    }
  },
}))

import { RunCommand } from './run-command'
import { ProjectDefinitionContext } from './project-command'

describe('brt run', () => {
  let workDir: string

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-run-'))
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    runnerMocks.constructors.length = 0
    runnerMocks.run.mockReset().mockResolvedValue(0)
    envMocks.fetchDevConfigVars.mockReset().mockResolvedValue({ REMOTE_SECRET: 'sealed' })
    envMocks.buildDevWorkerEnvironment.mockReset().mockReturnValue({ SCRIPT_ENV: 'ready' })
    commandMocks.addConstructors.length = 0
    commandMocks.addRun.mockReset().mockResolvedValue(undefined)
    commandMocks.buildConstructors.length = 0
    commandMocks.buildContexts.length = 0
    commandMocks.buildRun.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('declares a one-shot script, variadic args, prod target and force regeneration', () => {
    expect(schemas.run).toMatchObject({
      scriptPath: { positional: true, idx: 0, demandOption: true },
      scriptArgs: { positional: true, idx: 1, array: true },
      prod: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    })
  })

  it('runs against the attested development target and inherits the brt dev config-var environment', async () => {
    const client = { base: 'https://cloud.example' }
    const command = makeCommand({ scriptArgs: ['alpha', 'beta'], force: true })
    ;(command as any).devCloudapiTarget = vi.fn(async () => ({
      client,
      workspaceId: '12',
      runtimeBotId: 'dev_opaque',
      targetBotId: '34',
    }))
    ;(command as any).resolveProfile = vi.fn(async () => ({
      name: 'default',
      profile: { token: 'pat_dev', apiUrl: 'https://cloud.example', workspaceId: '12' },
    }))

    await command.run()

    expect(envMocks.fetchDevConfigVars).toHaveBeenCalledWith({
      client,
      runtimeBotId: 'dev_opaque',
      workspaceId: '12',
    })
    expect(envMocks.buildDevWorkerEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: 'https://cloud.example',
        token: 'pat_dev',
        workspaceId: '12',
        target: { runtimeBotId: 'dev_opaque', targetBotId: '34' },
        configVars: { REMOTE_SECRET: 'sealed' },
      })
    )
    expect(runnerMocks.constructors).toEqual([
      expect.objectContaining({
        projectPath: workDir,
        credentials: { token: 'pat_dev', apiUrl: 'https://cloud.example', workspaceId: '12' },
        forceRegenerate: true,
        prod: false,
        toolchain: expect.objectContaining({
          installDependency: expect.any(Function),
          buildGeneratedBot: expect.any(Function),
        }),
      }),
    ])
    expect(runnerMocks.run).toHaveBeenCalledWith('scripts/check.ts', {
      args: ['alpha', 'beta'],
      env: { SCRIPT_ENV: 'ready' },
      inheritStdio: true,
    })
  })

  it('runs against agent.json in production without downloading stored secrets', async () => {
    const command = makeCommand({ prod: true })
    ;(command as any).loadLink = vi.fn(() => ({
      botId: '34',
      workspaceId: '12',
      apiUrl: 'https://cloud.example',
    }))
    ;(command as any).resolveProfile = vi.fn(async () => ({
      name: 'default',
      profile: { token: 'pat_prod', apiUrl: 'https://cloud.example', workspaceId: '12' },
    }))
    ;(command as any).resolveApiUrl = vi.fn(() => 'https://cloud.example')

    await command.run()

    expect(envMocks.fetchDevConfigVars).not.toHaveBeenCalled()
    expect(runnerMocks.constructors[0]).toEqual(expect.objectContaining({
      projectPath: workDir,
      credentials: { token: 'pat_prod', apiUrl: 'https://cloud.example', workspaceId: '12' },
      forceRegenerate: false,
      prod: true,
      toolchain: expect.any(Object),
    }))
  })

  it('injects native add and build commands instead of spawning another brt CLI', async () => {
    const command = makeCommand()
    ;(command as any).devCloudapiTarget = vi.fn(async () => ({
      client: { base: 'https://cloud.example' },
      workspaceId: '12',
      runtimeBotId: 'dev_opaque',
      targetBotId: '34',
    }))
    ;(command as any).resolveProfile = vi.fn(async () => ({
      name: 'default',
      profile: { token: 'pat_dev', apiUrl: 'https://cloud.example', workspaceId: '12' },
    }))

    await command.run()

    const toolchain = runnerMocks.constructors[0]?.toolchain as {
      installDependency: (args: Record<string, unknown>) => Promise<void>
      buildGeneratedBot: (args: Record<string, unknown>) => Promise<void>
    }
    await toolchain.installDependency({
      resource: 'integration:telegram@1.2.3',
      botPath: '/generated/bot',
      workspaceId: '12',
      credentials: {
        token: 'scoped-token',
        apiUrl: 'https://scoped.example',
        workspaceId: '12',
      },
    })

    expect(commandMocks.addConstructors).toEqual([
      expect.objectContaining({
        profile: undefined,
        packageRef: 'integration:telegram@1.2.3',
        installPath: '/generated/bot',
        useDev: false,
        alias: undefined,
        confirm: true,
        apiUrl: 'https://scoped.example',
        token: 'scoped-token',
        workspaceId: '12',
      }),
    ])

    const dispose = vi
      .spyOn(ProjectDefinitionContext.prototype, 'dispose')
      .mockResolvedValue(undefined)
    await toolchain.buildGeneratedBot({
      botPath: '/generated/bot',
      sourceMap: true,
      minify: true,
    })

    expect(commandMocks.buildConstructors).toEqual([
      expect.objectContaining({
        workDir: '/generated/bot',
        sourceMap: true,
        minify: true,
      }),
    ])
    expect(commandMocks.buildContexts).toHaveLength(1)
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('disposes the native build context when the generated build fails', async () => {
    const command = makeCommand()
    const toolchain = (command as any)._buildScriptRunnerToolchain()
    const dispose = vi
      .spyOn(ProjectDefinitionContext.prototype, 'dispose')
      .mockResolvedValue(undefined)
    commandMocks.buildRun.mockRejectedValueOnce(new Error('native build failed'))

    await expect(
      toolchain.buildGeneratedBot({
        botPath: '/generated/bot',
        sourceMap: true,
        minify: true,
      })
    ).rejects.toThrow('native build failed')
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('rejects a local production mix before resolving credentials', async () => {
    const command = makeCommand({ prod: true, local: true })
    await expect(command.run()).rejects.toThrow(/--local.*--prod/)
    expect(runnerMocks.constructors).toHaveLength(0)
  })

  it('rejects a production bot override that differs from agent.json', async () => {
    const command = makeCommand({ prod: true, botId: '99' })
    ;(command as any).loadLink = vi.fn(() => ({
      botId: '34',
      workspaceId: '12',
      apiUrl: 'https://cloud.example',
    }))

    await expect(command.run()).rejects.toThrow(/cannot override agent\.json/)
    expect(runnerMocks.constructors).toHaveLength(0)
  })

  function makeCommand(overrides: Record<string, unknown> = {}): RunCommand {
    return new RunCommand({} as any, {} as any, new Logger(), {
      botpressHome: path.join(workDir, '.brt-home'),
      workDir,
      profile: undefined,
      apiUrl: undefined,
      botId: undefined,
      local: false,
      scriptPath: 'scripts/check.ts',
      scriptArgs: undefined,
      prod: false,
      force: false,
      ...overrides,
    } as any)
  }
})
