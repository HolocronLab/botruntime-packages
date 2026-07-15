import { expect, test } from 'bun:test'
import { createRequire } from 'node:module'

const { Client } = createRequire(import.meta.url)('../dist/index.cjs') as typeof import('../dist/index')

test('listenConversation polls the self-hosted Chat API and emits new messages', async () => {
  const messages: any[] = []
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/hello' || url.pathname === '/hello/') return Response.json({})
      if (url.pathname === '/users' && req.method === 'POST') {
        return Response.json({ user: { id: 'usr_1', createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z' }, key: 'key_1' })
      }
      if (url.pathname === '/conversations' && req.method === 'POST') {
        return Response.json({ conversation: { id: 'conv_1', createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z' } })
      }
      if (url.pathname === '/conversations/conv_1/messages') return Response.json({ messages, meta: {} })
      return Response.json({ code: 404, message: 'not found' }, { status: 404 })
    },
  })

  try {
    const client = await Client.connect({ apiUrl: `http://127.0.0.1:${server.port}` })
    const listener = await client.listenConversation({ id: 'conv_1' })
    const received = new Promise<any>((resolve, reject) => {
      listener.on('message_created', resolve)
      listener.on('error', reject)
    })
    messages.push({
      id: 'msg_1',
      createdAt: '2026-07-15T00:00:01.000Z',
      conversationId: 'conv_1',
      userId: 'bot_1',
      payload: { type: 'text', text: 'Здравствуйте' },
      isBot: true,
    })

    expect(await received).toEqual(expect.objectContaining({ id: 'msg_1', isBot: true }))
    await listener.disconnect()
  } finally {
    server.stop(true)
  }
})
