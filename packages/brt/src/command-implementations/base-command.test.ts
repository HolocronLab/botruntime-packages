import { describe, expect, it } from 'vitest'
import { Logger } from '../logger'
import { BaseCommand } from './base-command'

class ExitCommand extends BaseCommand<any> {
  public constructor(private readonly code: number) {
    super(new Logger(), {})
  }

  protected async run(): Promise<void> {
    this.setExitCode(this.code)
  }
}

describe('BaseCommand exit code', () => {
  it('preserves a one-shot child process exit code', async () => {
    await expect(new ExitCommand(130).handler()).resolves.toEqual({ exitCode: 130 })
  })
})
