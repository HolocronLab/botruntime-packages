import { describe, expect, it } from 'vitest'
import { schemas } from '../config'
import { chatApiUrlFor, chatTransportTarget } from './chat-command'

describe('brt chat endpoint', () => {
  it('declares an explicit development target flag', () => {
    expect(schemas.chat).toHaveProperty('dev', expect.objectContaining({ type: 'boolean' }))
  })

  it('maps an attested development target to the workspace Chat installation', () => {
    const client = {} as any
    expect(
      chatTransportTarget({
        client,
        selector: 'dev_runtime',
        runtimeBotId: 'dev_runtime',
        output: {
          environment: 'development',
          workspaceId: '12',
          runtimeBotId: 'dev_runtime',
          targetBotId: '34',
        },
      })
    ).toEqual({ client, workspaceId: '12', botId: '34', development: true })
  })

  it('keeps production Chat on the bot-scoped transport', () => {
    const client = {} as any
    expect(
      chatTransportTarget({
        client,
        selector: '34',
        output: { environment: 'production', workspaceId: '12', botId: '34' },
      })
    ).toEqual({ client, workspaceId: '12', botId: '34', development: false })
  })

  it('uses the generic integration ingress on the selected cloudapi', () => {
    expect(chatApiUrlFor('https://api.botruntime.ru/', undefined, 'wh_1')).toBe(
      'https://api.botruntime.ru/hooks/wh_1',
    )
  })

  it('honors an explicit chat base URL', () => {
    expect(
      chatApiUrlFor('https://ignored', 'http://localhost:8080/custom/', 'wh_1'),
    ).toBe('http://localhost:8080/custom/wh_1')
  })
})
