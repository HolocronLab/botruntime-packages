import { describe, expect, it } from 'vitest'
import { BotDefinition } from '@holocronlab/botruntime-sdk'
import { prepareCreateBotBody } from './bot-body'

describe('bot deployment body', () => {
  it('carries the configured bot execution timeout', async () => {
    const body = await prepareCreateBotBody(new BotDefinition({ maxExecutionTime: 300 }))

    expect(body.maxExecutionTime).toBe(300)
  })
})
