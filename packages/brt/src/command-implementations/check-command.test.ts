import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const adkMocks = vi.hoisted(() => ({ load: vi.fn(), buildRecurringEvents: vi.fn(() => ({})) }))

vi.mock('../adk-bundle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../adk-bundle')>()),
  isAgentProject: () => true,
  loadAdkProjectTools: async () => ({
    AgentProject: { load: adkMocks.load },
  }),
  buildRecurringEventsManifest: adkMocks.buildRecurringEvents,
}))

vi.mock('../errors', () => ({
  BotpressCLIError: class BotpressCLIError extends Error {},
}))

vi.mock('./global-command', () => ({
  GlobalCommand: class GlobalCommand {
    protected argv: Record<string, unknown>
    protected logger: Record<string, ReturnType<typeof vi.fn>>

    constructor(_api: unknown, _prompt: unknown, logger: Record<string, ReturnType<typeof vi.fn>>, argv: Record<string, unknown>) {
      this.logger = logger
      this.argv = argv
    }
  },
}))

import { CheckCommand } from './check-command'

describe('brt check', () => {
  let workDir: string

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-check-'))
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
  })

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('fails offline when primitive discovery contains an invalid constructor', async () => {
    adkMocks.load.mockResolvedValue({
      info: {
        errors: [],
        warnings: [
          {
            code: 'INVALID_PRIMITIVE_DEFINITION',
            message: "Invalid table name 'dailyChats'",
            file: 'src/tables/index.ts',
          },
        ],
      },
      conversations: [],
      knowledge: [],
      triggers: [],
      workflows: [],
      actions: [],
      tables: [],
      customComponents: [],
      tools: [],
    })

    const command = new CheckCommand({} as never, {} as never, { log: vi.fn(), success: vi.fn() } as never, {
      workDir,
      botpressHome: path.join(workDir, '.brt-home'),
      verbose: false,
      confirm: false,
      json: false,
    } as never)

    await expect(command.run()).rejects.toThrow(/dailyChats|primitive discovery/i)
    expect(adkMocks.load).toHaveBeenCalledWith(workDir, { offline: true, noCache: true })
  })

  it('fails when a non-empty src tree discovers no user primitives', async () => {
    fs.mkdirSync(path.join(workDir, 'src'), { recursive: true })
    fs.writeFileSync(path.join(workDir, 'src', 'helpers.ts'), 'export const answer = 42')
    adkMocks.load.mockResolvedValue({
      info: { errors: [], warnings: [] },
      conversations: [],
      knowledge: [],
      triggers: [],
      workflows: [{ path: '<adk:builtin>' }],
      actions: [{ path: '<adk:builtin>' }],
      tables: [],
      customComponents: [],
      tools: [],
    })

    const command = new CheckCommand({} as never, {} as never, { log: vi.fn(), success: vi.fn() } as never, {
      workDir,
      botpressHome: path.join(workDir, '.brt-home'),
      verbose: false,
      confirm: false,
      json: false,
    } as never)

    await expect(command.run()).rejects.toThrow(/no user primitives|empty bot/i)
  })
})
