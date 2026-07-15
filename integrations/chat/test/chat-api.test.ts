import { describe, expect, test } from 'bun:test'
import jwt from 'jsonwebtoken'
import { handleChatRequest, type ChatCoreClient } from '../src/chat-api'

class MemoryCore implements ChatCoreClient {
  users = new Map<string, any>()
  conversations = new Map<string, any>()
  participants = new Map<string, Set<string>>()
  messages: any[] = []
  private seq = 0

  async createUser(input: any) {
    const id = `usr_${++this.seq}`
    const user = { id, createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z', tags: input.tags, name: input.name, pictureUrl: input.pictureUrl }
    this.users.set(id, user)
    return { user }
  }
  async getUser({ id }: any) {
    const user = this.users.get(id)
    if (!user) throw Object.assign(new Error('not found'), { code: 404 })
    return { user }
  }
  async updateUser({ id, ...input }: any) {
    const user = { ...this.users.get(id), ...input }
    this.users.set(id, user)
    return { user }
  }
  async deleteUser({ id }: any) { this.users.delete(id); return {} }
  async createConversation(input: any) {
    const id = `conv_${++this.seq}`
    const conversation = { id, createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z', tags: input.tags, channel: input.channel, integration: 'chat' }
    this.conversations.set(id, conversation)
    return { conversation }
  }
  async getConversation({ id }: any) { return { conversation: this.conversations.get(id) } }
  async listConversations({ tags }: any) {
    return { conversations: [...this.conversations.values()].filter((c) => !tags?.owner || c.tags.owner === tags.owner), meta: {} }
  }
  async deleteConversation({ id }: any) { this.conversations.delete(id); return {} }
  async addParticipant({ id, userId }: any) {
    const set = this.participants.get(id) ?? new Set<string>(); set.add(userId); this.participants.set(id, set)
    return { participant: this.users.get(userId) }
  }
  async getParticipant({ id, userId }: any) {
    if (!this.participants.get(id)?.has(userId)) throw Object.assign(new Error('not found'), { code: 404 })
    return { participant: this.users.get(userId) }
  }
  async listParticipants({ id }: any) { return { participants: [...(this.participants.get(id) ?? [])].map((x) => this.users.get(x)), meta: {} } }
  async removeParticipant({ id, userId }: any) { this.participants.get(id)?.delete(userId); return {} }
  async createMessage(input: any) {
    const message = { id: `msg_${++this.seq}`, createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z', ...input, direction: 'incoming' }
    this.messages.push(message)
    return { message }
  }
  async listMessages({ conversationId }: any) { return { messages: this.messages.filter((m) => m.conversationId === conversationId), meta: {} } }
  async getMessage({ id }: any) { return { message: this.messages.find((m) => m.id === id) } }
  async deleteMessage({ id }: any) { this.messages = this.messages.filter((m) => m.id !== id); return {} }
  async createEvent(input: any) { return { event: { id: `evt_${++this.seq}`, createdAt: '2026-07-15T00:00:00.000Z', ...input } } }
  async getEvent({ id }: any) { return { event: { id, createdAt: '2026-07-15T00:00:00.000Z', payload: {} } } }
}

const request = (method: string, path: string, body?: unknown, key?: string) => ({
  method,
  path: `/hooks/wh_chat${path}`,
  query: '',
  headers: key ? { 'x-user-key': key } : {},
  body: body === undefined ? '' : JSON.stringify(body),
})

describe('Chat API', () => {
  test('creates an authenticated user without platform credentials', async () => {
    const core = new MemoryCore()
    const response = await handleChatRequest({ req: request('POST', '/users', { name: 'Иван' }), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })

    expect(response.status).toBe(200)
    const body = JSON.parse(response.body as string)
    expect(body.user.name).toBe('Иван')
    expect(jwt.verify(body.key, 'test-secret')).toEqual(expect.objectContaining({ id: body.user.id }))
  })

  test('creates a normal chat conversation and incoming message', async () => {
    const core = new MemoryCore()
    const created = await handleChatRequest({ req: request('POST', '/users', {}), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })
    const { key, user } = JSON.parse(created.body as string)

    const conversationResponse = await handleChatRequest({ req: request('POST', '/conversations', {}, key), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })
    const { conversation } = JSON.parse(conversationResponse.body as string)
    const messageResponse = await handleChatRequest({ req: request('POST', '/messages', { conversationId: conversation.id, payload: { type: 'text', text: 'Привет' } }, key), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })
    const { message } = JSON.parse(messageResponse.body as string)

    expect(core.conversations.get(conversation.id).channel).toBe('channel')
    expect(core.participants.get(conversation.id)?.has(user.id)).toBe(true)
    expect(message).toEqual(expect.objectContaining({ conversationId: conversation.id, userId: user.id, payload: { type: 'text', text: 'Привет' } }))
  })

  test('rejects invalid keys and cross-conversation access', async () => {
    const core = new MemoryCore()
    const a = JSON.parse((await handleChatRequest({ req: request('POST', '/users', {}), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })).body as string)
    const b = JSON.parse((await handleChatRequest({ req: request('POST', '/users', {}), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })).body as string)
    const conv = JSON.parse((await handleChatRequest({ req: request('POST', '/conversations', {}, a.key), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })).body as string).conversation

    const invalid = await handleChatRequest({ req: request('GET', `/conversations/${conv.id}`, undefined, 'bad'), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })
    const forbidden = await handleChatRequest({ req: request('GET', `/conversations/${conv.id}`, undefined, b.key), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })

    expect(invalid.status).toBe(401)
    expect(forbidden.status).toBe(403)
  })

  test('never lets a user key update another user through body fields', async () => {
    const core = new MemoryCore()
    const a = JSON.parse((await handleChatRequest({ req: request('POST', '/users', { name: 'A' }), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })).body as string)
    const b = JSON.parse((await handleChatRequest({ req: request('POST', '/users', { name: 'B' }), client: core, webhookId: 'wh_chat', encryptionKey: 'test-secret' })).body as string)

    const response = await handleChatRequest({
      req: request('PUT', '/users/me', { id: b.user.id, name: 'updated A' }, a.key),
      client: core,
      webhookId: 'wh_chat',
      encryptionKey: 'test-secret',
    })

    expect(response.status).toBe(200)
    expect(core.users.get(a.user.id)?.name).toBe('updated A')
    expect(core.users.get(b.user.id)?.name).toBe('B')
  })
})
