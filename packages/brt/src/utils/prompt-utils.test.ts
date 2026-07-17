import { beforeEach, describe, expect, it, vi } from 'vitest'
import prompts from 'prompts'
import { CLIPrompt } from './prompt-utils'
import type { Logger } from '../logger'

vi.mock('prompts', () => ({ default: vi.fn() }))

const promptsMock = prompts as unknown as {
  mockReset: () => void
  mockResolvedValue: (value: unknown) => void
}

function fakeLogger(): Logger {
  return { debug: vi.fn(), cleanup: vi.fn() } as unknown as Logger
}

describe('CLIPrompt', () => {
  beforeEach(() => {
    promptsMock.mockReset()
  })

  describe('confirm', () => {
    it('auto-approves without prompting when -y/--confirm is set (blanket bypass, unchanged)', async () => {
      const cli = new CLIPrompt({ confirm: true }, fakeLogger())
      await expect(cli.confirm('routine change ok?')).resolves.toBe(true)
      expect(prompts).not.toHaveBeenCalled()
    })

    it('prompts interactively when -y/--confirm is not set', async () => {
      promptsMock.mockResolvedValue({ confirm: true })
      const cli = new CLIPrompt({ confirm: false }, fakeLogger())
      await expect(cli.confirm('routine change ok?')).resolves.toBe(true)
      expect(prompts).toHaveBeenCalledTimes(1)
    })
  })

  describe('confirmInteractive', () => {
    // Used by the destructive table-sync confirm gate: -y/--confirm must NOT
    // satisfy a destructive schema change, so this method always goes to the
    // real interactive prompt, regardless of the blanket flag.
    it('ALWAYS prompts interactively, ignoring the blanket -y/--confirm flag', async () => {
      promptsMock.mockResolvedValue({ confirm: false })
      const cli = new CLIPrompt({ confirm: true }, fakeLogger())
      await expect(cli.confirmInteractive('drop column "x" (data loss)?')).resolves.toBe(false)
      expect(prompts).toHaveBeenCalledTimes(1)
    })

    it('returns the real answer when accepted', async () => {
      promptsMock.mockResolvedValue({ confirm: true })
      const cli = new CLIPrompt({ confirm: false }, fakeLogger())
      await expect(cli.confirmInteractive('drop column "x" (data loss)?')).resolves.toBe(true)
    })
  })

  describe('password', () => {
    it('uses the terminal password control without placing the entered value in prompt metadata', async () => {
      const secret = 'test-secret-that-must-not-be-rendered'
      promptsMock.mockResolvedValue({ prompted: secret })
      const logger = fakeLogger()
      const cli = new CLIPrompt({ confirm: false }, logger)

      await expect(cli.password('Enter secret')).resolves.toBe(secret)
      expect(prompts).toHaveBeenCalledWith({
        type: 'password',
        name: 'prompted',
        message: 'Enter secret',
        initial: undefined,
      })
      expect(JSON.stringify((prompts as any).mock.calls)).not.toContain(secret)
      expect(JSON.stringify(Object.values(logger).flatMap((mock: any) => mock.mock?.calls ?? []))).not.toContain(secret)
    })
  })
})
