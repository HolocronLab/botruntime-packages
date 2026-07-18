import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { schemas } from '../config'
import { Logger } from '../logger'
import { ChatCommand, chatApiUrlFor, chatTransportTarget } from './chat-command'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => ({
    createConversation: vi.fn(async () => ({ conversation: { id: 'conv_prod' } })),
  })),
  wait: vi.fn(async () => undefined),
}))

vi.mock('@holocronlab/botruntime-chat', () => ({ Client: { connect: mocks.connect } }))
vi.mock('../chat', () => ({ Chat: { launch: vi.fn(() => ({ wait: mocks.wait })) } }))

describe('brt chat endpoint', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    mocks.connect.mockClear()
    mocks.wait.mockClear()
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('declares an explicit development target flag', () => {
    expect(schemas.chat).toHaveProperty('dev', expect.objectContaining({ type: 'boolean' }))
  })

  it('maps an attested development target to the workspace Chat installation', () => {
    const client = {} as any
    expect(
      chatTransportTarget({
        client,
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

  it('maps production Chat to the canonical workspace target', () => {
    const client = {} as any
    expect(
      chatTransportTarget({
        client,
        output: { environment: 'production', workspaceId: '12', botId: '34' },
      })
    ).toEqual({ client, workspaceId: '12', botId: '34', development: false })
  })

  it('provisions production Chat with the workspace PAT when no per-bot key exists', async () => {
    const botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-chat-home-'))
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-chat-project-'))
    tempDirs.push(botpressHome, workDir)
    fs.writeFileSync(
      path.join(botpressHome, 'profiles.json'),
      JSON.stringify({
        default: {
          apiUrl: 'https://cloud.example',
          workspaceId: '12',
          token: 'brt_pat_prod',
        },
      }),
    )
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: '34', workspaceId: '12', apiUrl: 'https://cloud.example' }),
    )

    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
        calls.push({ url: String(input), init })
        return Response.json({
          installations: [
            {
              id: '7',
              name: 'botruntime/chat',
              version: '0.7.6',
              webhookId: 'wh_prod',
              enabled: true,
              status: 'registered',
              registered: true,
            },
          ],
        })
      }),
    )
    vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as any)

    const command = new ChatCommand({} as any, {} as any, new Logger(), {
      botpressHome,
      workDir,
      profile: 'default',
      apiUrl: undefined,
      botId: undefined,
      local: false,
      dev: false,
      chatApiUrl: undefined,
      protocol: 'polling',
    } as any)

    await command.run()

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(
      'https://cloud.example/v1/admin/workspaces/12/bots/34/integrations',
    )
    expect(calls[0]!.init.headers).toMatchObject({
      authorization: 'Bearer brt_pat_prod',
    })
    expect((calls[0]!.init.headers as Record<string, string>)['x-bot-id']).toBeUndefined()
    expect(mocks.connect).toHaveBeenCalledWith({ apiUrl: 'https://cloud.example/hooks/wh_prod' })
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
