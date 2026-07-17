import { describe, expect, it, vi } from 'vitest'
import type { Logger } from '../logger'
import { ProjectCommand } from './project-command'

class SecretPromptHarness extends ProjectCommand<any> {
  protected async run(): Promise<void> {}

  public collect() {
    return this.promptSecrets({ secrets: { ZVENO_API_KEY: { optional: true } } }, { secrets: [] } as any)
  }
}

describe('project secret prompts', () => {
  it('uses masked input and never writes the entered secret to logger output', async () => {
    const secret = 'test-secret-that-must-not-be-rendered'
    const prompt = {
      password: vi.fn().mockResolvedValue(secret),
      text: vi.fn().mockResolvedValue(secret),
    }
    const logger = {
      debug: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger
    const command = new SecretPromptHarness({} as any, prompt as any, logger, {} as any)

    const result = await command.collect()

    expect(result).toEqual({ ZVENO_API_KEY: secret })
    expect(prompt.password).toHaveBeenCalledWith('Enter value for secret "ZVENO_API_KEY" (optional)')
    expect(prompt.text).not.toHaveBeenCalled()
    expect(JSON.stringify(Object.values(logger).flatMap((mock: any) => mock.mock.calls))).not.toContain(secret)
  })
})
