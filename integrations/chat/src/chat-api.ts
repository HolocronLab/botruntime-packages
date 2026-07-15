import jwt from 'jsonwebtoken'

type Awaitable<T> = T | Promise<T>

export type ChatCoreClient = {
  createUser(input: any): Awaitable<any>
  getUser(input: any): Awaitable<any>
  updateUser(input: any): Awaitable<any>
  deleteUser(input: any): Awaitable<any>
  createConversation(input: any): Awaitable<any>
  getConversation(input: any): Awaitable<any>
  listConversations(input: any): Awaitable<any>
  deleteConversation(input: any): Awaitable<any>
  addParticipant(input: any): Awaitable<any>
  getParticipant(input: any): Awaitable<any>
  listParticipants(input: any): Awaitable<any>
  removeParticipant(input: any): Awaitable<any>
  createMessage(input: any): Awaitable<any>
  listMessages(input: any): Awaitable<any>
  getMessage(input: any): Awaitable<any>
  deleteMessage(input: any): Awaitable<any>
  createEvent(input: any): Awaitable<any>
  getEvent(input: any): Awaitable<any>
}

export type RawChatRequest = {
  method: string
  path?: string
  query?: string
  headers?: Record<string, string | undefined>
  body?: string
}

export type ChatHTTPResponse = {
  status: number
  headers?: Record<string, string>
  body?: string
}

type HandlerProps = {
  req: RawChatRequest
  client: ChatCoreClient
  webhookId: string
  encryptionKey: string
}

class HTTPError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,x-user-key',
}

const json = (body: unknown, status = 200): ChatHTTPResponse => ({
  status,
  headers: jsonHeaders,
  body: JSON.stringify(body),
})

const empty = (status = 204): ChatHTTPResponse => ({ status, headers: jsonHeaders })

const parseBody = (req: RawChatRequest): Record<string, any> => {
  if (!req.body) return {}
  try {
    const parsed = JSON.parse(req.body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required')
    return parsed
  } catch {
    throw new HTTPError(400, 'Invalid JSON body')
  }
}

const userKey = (req: RawChatRequest): string => {
  for (const [name, value] of Object.entries(req.headers ?? {})) {
    if (name.toLowerCase() === 'x-user-key' && value) return value
  }
  throw new HTTPError(401, 'Missing user key')
}

const authenticate = (req: RawChatRequest, encryptionKey: string): string => {
  try {
    const payload = jwt.verify(userKey(req), encryptionKey, { algorithms: ['HS256'] })
    if (!payload || typeof payload === 'string' || typeof payload.id !== 'string' || !payload.id) {
      throw new Error('invalid payload')
    }
    return payload.id
  } catch (error) {
    if (error instanceof HTTPError) throw error
    throw new HTTPError(401, 'Invalid user key')
  }
}

const mapUser = (user: any) => ({
  id: user.id,
  ...(user.name ? { name: user.name } : {}),
  ...(user.pictureUrl ? { pictureUrl: user.pictureUrl } : {}),
  ...(user.tags?.profile ? { profile: user.tags.profile } : {}),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
})

const mapConversation = (conversation: any) => ({
  id: conversation.id,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
})

const mapMessage = (message: any) => ({
  id: message.id,
  createdAt: message.createdAt,
  payload: { type: message.type, ...(message.payload ?? {}) },
  userId: message.userId,
  conversationId: message.conversationId,
  isBot: message.direction === 'outgoing',
  ...(message.tags && Object.keys(message.tags).length ? { metadata: message.tags } : {}),
})

const mapEvent = (event: any) => ({
  id: event.id,
  createdAt: event.createdAt,
  payload: event.payload?.payload ?? event.payload ?? {},
  conversationId: event.conversationId ?? event.payload?.conversationId,
  userId: event.userId ?? event.payload?.userId,
})

const relativePath = (path: string | undefined, webhookId: string): string => {
  const raw = path || '/'
  const prefix = `/hooks/${webhookId}`
  if (raw === prefix) return '/'
  if (raw.startsWith(`${prefix}/`)) return raw.slice(prefix.length)
  return raw
}

const ensureParticipant = async (client: ChatCoreClient, conversationId: string, userId: string) => {
  try {
    const { participant } = await client.getParticipant({ id: conversationId, userId })
    if (!participant) throw new Error('missing participant')
  } catch {
    throw new HTTPError(403, 'You are not a participant in this conversation')
  }
}

const ensureOwner = async (client: ChatCoreClient, conversationId: string, userId: string) => {
  const { conversation } = await client.getConversation({ id: conversationId })
  if (!conversation || conversation.tags?.owner !== userId) {
    throw new HTTPError(403, 'You are not the owner of this conversation')
  }
  return conversation
}

const codeOf = (error: unknown): number => {
  if (error && typeof error === 'object') {
    const value = (error as any).code ?? (error as any).status
    if (typeof value === 'number' && value >= 400 && value <= 599) return value
  }
  return 500
}

export async function handleChatRequest({ req, client, webhookId, encryptionKey }: HandlerProps): Promise<ChatHTTPResponse> {
  if (!encryptionKey) return json({ code: 500, message: 'Chat encryption key is not configured' }, 500)

  const method = req.method.toUpperCase()
  const path = relativePath(req.path, webhookId).replace(/\/+$/, '') || '/'
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent)
  const query = new URLSearchParams(req.query ?? '')

  try {
    if (method === 'OPTIONS') return empty(204)
    if (method === 'GET' && path === '/hello') return json({})

    if (method === 'POST' && path === '/users') {
      const body = parseBody(req)
      const { user } = await client.createUser({
        tags: { ...(body.profile ? { profile: String(body.profile) } : {}) },
        ...(body.name ? { name: String(body.name) } : {}),
        ...(body.pictureUrl ? { pictureUrl: String(body.pictureUrl) } : {}),
      })
      return json({ user: mapUser(user), key: jwt.sign({ id: user.id }, encryptionKey, { algorithm: 'HS256' }) })
    }

    const authenticatedUserId = authenticate(req, encryptionKey)

    if (path === '/users/get-or-create' && method === 'POST') {
      const body = parseBody(req)
      const { user } = await client.updateUser({
        id: authenticatedUserId,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.pictureUrl !== undefined ? { pictureUrl: body.pictureUrl } : {}),
        ...(body.profile !== undefined ? { tags: { profile: String(body.profile) } } : {}),
      })
      return json({ user: mapUser(user) })
    }
    if (path === '/users/me' && method === 'GET') {
      const { user } = await client.getUser({ id: authenticatedUserId })
      return json({ user: mapUser(user) })
    }
    if (path === '/users/me' && method === 'PUT') {
      const body = parseBody(req)
      const { user } = await client.updateUser({
        id: authenticatedUserId,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.pictureUrl !== undefined ? { pictureUrl: body.pictureUrl } : {}),
        ...(body.profile !== undefined ? { tags: { profile: String(body.profile) } } : {}),
      })
      return json({ user: mapUser(user) })
    }
    if (path === '/users/me' && method === 'DELETE') {
      await client.deleteUser({ id: authenticatedUserId })
      return empty()
    }

    if (path === '/conversations' && method === 'POST') {
      const body = parseBody(req)
      const { conversation } = await client.createConversation({
        channel: 'channel',
        tags: { owner: authenticatedUserId, ...(body.id ? { fid: String(body.id) } : {}) },
      })
      await client.addParticipant({ id: conversation.id, userId: authenticatedUserId })
      return json({ conversation: mapConversation(conversation) })
    }
    if (path === '/conversations/get-or-create' && method === 'POST') {
      const body = parseBody(req)
      if (!body.id) throw new HTTPError(400, 'Conversation id is required')
      const listed = await client.listConversations({ tags: { owner: authenticatedUserId, fid: String(body.id) }, pageSize: 1 })
      let conversation = listed.conversations?.[0]
      if (!conversation) {
        ;({ conversation } = await client.createConversation({ channel: 'channel', tags: { owner: authenticatedUserId, fid: String(body.id) } }))
        await client.addParticipant({ id: conversation.id, userId: authenticatedUserId })
      }
      return json({ conversation: mapConversation(conversation) })
    }
    if (path === '/conversations' && method === 'GET') {
      const { conversations, meta } = await client.listConversations({ tags: { owner: authenticatedUserId }, nextToken: query.get('nextToken') ?? undefined })
      return json({ conversations: conversations.map(mapConversation), meta })
    }
    if (segments[0] === 'conversations' && segments.length === 2) {
      const conversationId = segments[1]!
      if (method === 'GET') {
        await ensureParticipant(client, conversationId, authenticatedUserId)
        const { conversation } = await client.getConversation({ id: conversationId })
        return json({ conversation: mapConversation(conversation) })
      }
      if (method === 'DELETE') {
        await ensureOwner(client, conversationId, authenticatedUserId)
        await client.deleteConversation({ id: conversationId })
        return empty()
      }
    }
    if (segments[0] === 'conversations' && segments[2] === 'messages' && segments.length === 3 && method === 'GET') {
      const conversationId = segments[1]!
      await ensureParticipant(client, conversationId, authenticatedUserId)
      const { messages, meta } = await client.listMessages({ conversationId, nextToken: query.get('nextToken') ?? undefined })
      return json({ messages: messages.map(mapMessage), meta })
    }
    if (segments[0] === 'conversations' && segments[2] === 'listen' && method === 'GET') {
      await ensureParticipant(client, segments[1]!, authenticatedUserId)
      return json({ code: 501, message: 'Streaming is not available; use listMessages polling' }, 501)
    }
    if (segments[0] === 'conversations' && segments[2] === 'participants') {
      const conversationId = segments[1]!
      await ensureOwner(client, conversationId, authenticatedUserId)
      if (segments.length === 3 && method === 'POST') {
        const body = parseBody(req)
        const { participant } = await client.addParticipant({ id: conversationId, userId: body.userId })
        return json({ participant: mapUser(participant) })
      }
      if (segments.length === 3 && method === 'GET') {
        const { participants, meta } = await client.listParticipants({ id: conversationId, nextToken: query.get('nextToken') ?? undefined })
        return json({ participants: participants.map(mapUser), meta })
      }
      if (segments.length === 4 && method === 'GET') {
        const { participant } = await client.getParticipant({ id: conversationId, userId: segments[3]! })
        return json({ participant: mapUser(participant) })
      }
      if (segments.length === 4 && method === 'DELETE') {
        await client.removeParticipant({ id: conversationId, userId: segments[3]! })
        return empty()
      }
    }

    if (path === '/messages' && method === 'POST') {
      const body = parseBody(req)
      if (!body.conversationId || !body.payload?.type) throw new HTTPError(400, 'conversationId and payload.type are required')
      await ensureParticipant(client, body.conversationId, authenticatedUserId)
      const { type, ...payload } = body.payload
      const { message } = await client.createMessage({
        type,
        payload,
        conversationId: body.conversationId,
        userId: authenticatedUserId,
        tags: body.metadata ?? {},
      })
      return json({ message: mapMessage(message) })
    }
    if (segments[0] === 'messages' && segments.length === 2) {
      const { message } = await client.getMessage({ id: segments[1]! })
      if (!message) throw new HTTPError(404, 'Message not found')
      await ensureParticipant(client, message.conversationId, authenticatedUserId)
      if (method === 'GET') return json({ message: mapMessage(message) })
      if (method === 'DELETE') {
        if (message.userId !== authenticatedUserId) throw new HTTPError(403, 'You are not the sender of this message')
        await client.deleteMessage({ id: message.id })
        return empty()
      }
    }

    if (path === '/events' && method === 'POST') {
      const body = parseBody(req)
      if (!body.conversationId) throw new HTTPError(400, 'conversationId is required')
      await ensureParticipant(client, body.conversationId, authenticatedUserId)
      const { event } = await client.createEvent({
        type: 'custom',
        conversationId: body.conversationId,
        userId: authenticatedUserId,
        payload: { conversationId: body.conversationId, userId: authenticatedUserId, payload: body.payload ?? {} },
      })
      return json({ event: mapEvent(event) })
    }
    if (segments[0] === 'events' && segments.length === 2 && method === 'GET') {
      const { event } = await client.getEvent({ id: segments[1]! })
      const conversationId = event.conversationId ?? event.payload?.conversationId
      await ensureParticipant(client, conversationId, authenticatedUserId)
      return json({ event: mapEvent(event) })
    }

    throw new HTTPError(404, 'Route not found')
  } catch (error) {
    const status = error instanceof HTTPError ? error.status : codeOf(error)
    const message = error instanceof Error && status < 500 ? error.message : status === 404 ? 'Not found' : 'Chat API request failed'
    return json({ code: status, message }, status)
  }
}
