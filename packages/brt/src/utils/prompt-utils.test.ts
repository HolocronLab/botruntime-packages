import { beforeEach, describe, expect, it, vi } from 'vitest'
import prompts from 'prompts'
import { CLIPrompt } from './prompt-utils'
import type { Logger } from '../logger'

vi.mock('prompts')

function fakeLogger(): Logger {
  return { debug: vi.fn(), cleanup: vi.fn() } as unknown as Logger
}

describe('CLIPrompt', () => {
  beforeEach(() => {
    vi.mocked(prompts).mockReset()
  })

  describe('confirm', () => {
    it('auto-approves without prompting when -y/--confirm is set (blanket bypass, unchanged)', async () => {
      const cli = new CLIPrompt({ confirm: true }, fakeLogger())
      await expect(cli.confirm('routine change ok?')).resolves.toBe(true)
      expect(prompts).not.toHaveBeenCalled()
    })

    it('prompts interactively when -y/--confirm is not set', async () => {
      vi.mocked(prompts).mockResolvedValue({ confirm: true })
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
      vi.mocked(prompts).mockResolvedValue({ confirm: false })
      const cli = new CLIPrompt({ confirm: true }, fakeLogger())
      await expect(cli.confirmInteractive('drop column "x" (data loss)?')).resolves.toBe(false)
      expect(prompts).toHaveBeenCalledTimes(1)
    })

    it('returns the real answer when accepted', async () => {
      vi.mocked(prompts).mockResolvedValue({ confirm: true })
      const cli = new CLIPrompt({ confirm: false }, fakeLogger())
      await expect(cli.confirmInteractive('drop column "x" (data loss)?')).resolves.toBe(true)
    })
  })
})
