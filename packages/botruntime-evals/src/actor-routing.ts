import type { GraderResult } from './types'
import type { ConversationRelationSelector } from './definition'
import { chatPayloadToText } from './client'
import type { Client as BotruntimeClient } from '@holocronlab/botruntime-client'
import { EvalRunnerError } from './errors'

const DEFAULT_RESOLVE_TIMEOUT_MS = 5_000
const DEFAULT_POLL_INTERVAL_MS = 100

type Conversation = {
  id: string
  tags: Record<string, string>
  properties?: Record<string, string>
}
type PlatformMessage = {
  id: string
  direction: 'incoming' | 'outgoing'
  payload?: Record<string, unknown>
}
type ActorClient = Pick<
  BotruntimeClient,
  'listConversations' | 'createUser' | 'createMessage' | 'listMessages' | 'getConversation'
>

type DeliveryAssertions = {
  deliveredTo: string[]
  notDeliveredTo: string[]
  conversationMode?: { target: string; equals: string; property?: string }
}

export class ActorRouter {
  private readonly actorUsers = new Map<string, string>()
  private readonly relationConversations = new Map<string, string>()
  private readonly deliveryBaseline = new Map<string, Set<string>>()

  constructor(
    private readonly client: ActorClient,
    private readonly context: {
      primaryConversationId: string
      primaryUserId: string
      relations: Record<string, ConversationRelationSelector>
    },
    private readonly options: {
      resolveTimeoutMs?: number
      pollIntervalMs?: number
    } = {}
  ) {}

  async send(input: {
    actor: string
    relation: string
    message?: string
    payload?: Record<string, unknown> & { type: string }
  }): Promise<void> {
    const conversationId = await this.resolveTarget(input.relation)
    const userId = await this.resolveActor(input.actor)
    const payload = input.payload ?? {
      type: 'text',
      text: input.message ?? '',
    }
    await this.client.createMessage({
      conversationId,
      userId,
      type: payload.type,
      payload,
      tags: {},
      origin: 'synthetic',
    })
  }

  async startDeliveryObservation(targets: string[]): Promise<void> {
    this.deliveryBaseline.clear()
    await Promise.all(
      [...new Set(targets)].map(async (target) => {
        const messages = await this.listAllMessages(await this.resolveTarget(target))
        this.deliveryBaseline.set(target, new Set(messages.map((message) => message.id)))
      })
    )
  }

  async gradeDelivery(assertions: DeliveryAssertions): Promise<GraderResult[]> {
    const results: GraderResult[] = []
    for (const [target, expectedDelivery] of [
      ...assertions.deliveredTo.map((target) => [target, true] as const),
      ...assertions.notDeliveredTo.map((target) => [target, false] as const),
    ]) {
      const baseline = this.deliveryBaseline.get(target) ?? new Set<string>()
      const messages = await this.listAllMessages(await this.resolveTarget(target))
      const delivered = messages.some((message) => message.direction === 'outgoing' && !baseline.has(message.id))
      results.push({
        assertion: `${expectedDelivery ? 'delivered_to' : 'not_delivered_to'}:${target}`,
        pass: delivered === expectedDelivery,
        expected: expectedDelivery ? `A new outgoing message to ${target}` : `No new outgoing message to ${target}`,
        actual: delivered ? 'New outgoing message observed' : 'No new outgoing message observed',
      })
    }

    if (assertions.conversationMode) {
      const { target, equals, property = 'mode' } = assertions.conversationMode
      const { conversation } = await this.client.getConversation({
        id: await this.resolveTarget(target),
      })
      const actual = conversation.properties?.[property] ?? conversation.tags[property]
      results.push({
        assertion: `conversation_mode:${target}`,
        pass: actual === equals,
        expected: `${property}=${equals}`,
        actual: actual === undefined ? `${property} is absent` : `${property}=${actual}`,
      })
    }
    return results
  }

  async conversationId(target: string): Promise<string> {
    return this.resolveTarget(target)
  }

  async responsesFor(target: string): Promise<string[]> {
    const baseline = this.deliveryBaseline.get(target) ?? new Set<string>()
    const messages = await this.listAllMessages(await this.resolveTarget(target))
    return messages
      .filter((message) => message.direction === 'outgoing' && !baseline.has(message.id) && message.payload)
      .map((message) => chatPayloadToText(message.payload as any))
  }

  private async resolveActor(actor: string): Promise<string> {
    if (actor === 'client') return this.context.primaryUserId
    const cached = this.actorUsers.get(actor)
    if (cached) return cached
    const { user } = await this.client.createUser({
      tags: {},
      name: `eval:${actor}`,
    })
    this.actorUsers.set(actor, user.id)
    return user.id
  }

  private async resolveTarget(target: string): Promise<string> {
    if (target === 'client') return this.context.primaryConversationId
    const cached = this.relationConversations.get(target)
    if (cached) return cached
    const relation = this.context.relations[target]
    if (!relation) {
      throw new EvalRunnerError({
        code: 'EVAL_RELATION_UNDECLARED',
        message: `Eval relation '${target}' is not declared.`,
        expected: true,
      })
    }
    const expand = (value: string) =>
      value === '$conversationId'
        ? this.context.primaryConversationId
        : value === '$userId'
          ? this.context.primaryUserId
          : value
    const query = {
      tags: Object.fromEntries(Object.entries(relation.tags).map(([key, value]) => [key, expand(value)])),
      ...(relation.integration ? { integrationName: relation.integration } : {}),
      ...(relation.channel ? { channel: relation.channel } : {}),
      pageSize: 2,
    }
    const timeoutMs = this.options.resolveTimeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS
    const pollIntervalMs = this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    const deadline = Date.now() + timeoutMs
    let conversations: Conversation[] = []
    do {
      const page = await this.client.listConversations(query)
      conversations = page.conversations
      if (conversations.length === 1) break
      if (conversations.length > 1) {
        throw new EvalRunnerError({
          code: 'EVAL_RELATION_AMBIGUOUS',
          message: `Eval relation '${target}' resolved to multiple conversations.`,
          expected: true,
        })
      }
      if (Date.now() >= deadline) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(0, deadline - Date.now()))))
    } while (Date.now() <= deadline)
    if (conversations.length === 0) {
      throw new EvalRunnerError({
        code: 'EVAL_RELATION_NOT_FOUND',
        message: `Eval relation '${target}' did not resolve to a conversation before the timeout.`,
        expected: true,
      })
    }
    const id = conversations[0]!.id
    this.relationConversations.set(target, id)
    return id
  }

  private async listAllMessages(conversationId: string): Promise<PlatformMessage[]> {
    const messages: PlatformMessage[] = []
    let nextToken: string | undefined
    const seen = new Set<string>()
    do {
      if (nextToken && seen.has(nextToken)) throw new Error('Message pagination repeated its cursor.')
      if (nextToken) seen.add(nextToken)
      const page = await this.client.listMessages({
        conversationId,
        pageSize: 100,
        ...(nextToken ? { nextToken } : {}),
      })
      messages.push(...(page.messages as PlatformMessage[]))
      if (messages.length > 1_000) throw new Error('Eval delivery observation exceeded 1000 messages.')
      nextToken = page.meta.nextToken
    } while (nextToken)
    return messages
  }
}
