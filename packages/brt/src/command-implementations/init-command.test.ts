import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const adkMocks = vi.hoisted(() => ({
  generate: vi.fn(),
  loadAdkProjectInitializer: vi.fn(),
}))

vi.mock('../adk-bundle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../adk-bundle')>()),
  loadAdkProjectInitializer: adkMocks.loadAdkProjectInitializer,
}))

import { InitCommand } from './init-command'

describe('brt init bot', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it.each([
    ['empty', 'blank'],
    ['hello-world', 'hello-world'],
  ])('scaffolds --template %s as a deployable ADK project', async (cliTemplate, adkTemplate) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-init-adk-'))
    roots.push(root)

    class FakeGenerator {
      constructor(
        private readonly destination: string,
        packageManager: string,
        template: string
      ) {
        expect(packageManager).toBe('bun')
        expect(template).toBe(adkTemplate)
      }

      async generate() {
        fs.mkdirSync(this.destination, { recursive: true })
        fs.writeFileSync(path.join(this.destination, 'agent.config.ts'), 'export default {}')
        adkMocks.generate(this.destination)
      }
    }
    adkMocks.loadAdkProjectInitializer.mockResolvedValue({ AgentProjectGenerator: FakeGenerator })

    const logger = { success: vi.fn(), log: vi.fn(), warn: vi.fn() }
    const command = new InitCommand({} as never, {} as never, logger as never, {
      type: 'bot',
      template: cliTemplate,
      name: 'reminder-bot',
      workDir: root,
    } as never)

    await command.run()

    const destination = path.join(root, 'reminder-bot')
    expect(adkMocks.generate).toHaveBeenCalledWith(destination)
    expect(fs.existsSync(path.join(destination, 'agent.config.ts'))).toBe(true)
    expect(fs.existsSync(path.join(destination, 'bot.definition.ts'))).toBe(false)
  })
})
