import { Chat as _llmzChat, isAnyComponent, RenderedComponent, Transcript } from '@holocronlab/botruntime-llmz'

import { TranscriptItem, TranscriptState } from './transcript'
import { advanceTranscriptCursor, messagesAfterTranscriptCursor, TranscriptCursor } from './transcript-sync'
import { truncateTranscript } from './truncate-transcript'

import { AnyIncomingEvent, AnyIncomingMessage } from '@holocronlab/botruntime-sdk/dist/bot'

import { Message } from './messages'

import dedent from 'dedent'
import { span } from '../../telemetry/tracing'
import { isEvent, isMessage } from '../../utilities/events'
import { Errors } from '../../errors'
import { adk } from '../adk'
import { Config } from '../config'
import { BotContext } from '../context/context'
import { BUILT_IN_INTEGRATIONS, DefaultComponents } from './components'
import { Client, Message as APIMessage } from '@holocronlab/botruntime-client'
import { Autonomous } from '../autonomous'
import { BUILT_IN_TAGS, TrackedTags } from '../tracked-tags'

export type Msg = {
  type: string
  payload?: Record<string, unknown>
  tags?: Record<string, unknown>
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertValidOutgoingMessage(message: unknown): asserts message is Msg {
  if (!isPlainRecord(message)) {
    throw new Errors.InvalidMessageError(
      'chat.sendMessage expected a message object shaped like { type: string, payload?: Record<string, unknown> }.'
    )
  }

  const type = message.type
  if (typeof type !== 'string' || type.trim().length === 0) {
    throw new Errors.InvalidMessageError('chat.sendMessage expected message.type to be a non-empty string.')
  }

  if (message.payload !== undefined && !isPlainRecord(message.payload)) {
    throw new Errors.InvalidMessageError('chat.sendMessage expected message.payload to be an object when provided.')
  }

  if (message.tags !== undefined && !isPlainRecord(message.tags)) {
    throw new Errors.InvalidMessageError('chat.sendMessage expected message.tags to be an object when provided.')
  }
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isPlainRecord(value)) return undefined
  const field = value[key]
  return typeof field === 'string' && field.length > 0 ? field : undefined
}

function isPdfPayload(payload: unknown): boolean {
  const contentType = stringField(payload, 'contentType')
  if (contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/pdf') return true

  const title = stringField(payload, 'title')
  if (title && /\.pdf$/i.test(title.trim())) return true

  const fileUrl = stringField(payload, 'fileUrl')
  return Boolean(fileUrl && /\.pdf(?:$|[?#])/i.test(fileUrl))
}

function nativeAttachment(type: unknown, payload: unknown): Transcript.Attachment | undefined {
  if (type === 'image') {
    const url = stringField(payload, 'imageUrl')
    if (url) return { type: 'image', url }
    return undefined
  }

  if (type === 'file' && isPdfPayload(payload)) {
    const url = stringField(payload, 'fileUrl')
    if (!url) return undefined
    const title = stringField(payload, 'title')

    return {
      type: 'file',
      url,
      mimeType: 'application/pdf',
      ...(title ? { title } : {}),
    }
  }

  return undefined
}

function transcriptContent(item: TranscriptItem): string | undefined {
  return 'content' in item ? item.content : undefined
}

function sameAttachments(left: TranscriptItem, right: TranscriptItem): boolean {
  const leftAttachments = 'attachments' in left ? (left.attachments ?? []) : []
  const rightAttachments = 'attachments' in right ? (right.attachments ?? []) : []
  return JSON.stringify(leftAttachments) === JSON.stringify(rightAttachments)
}

export type ComponentHandler<
  T extends Autonomous.Component = Autonomous.Component,
  // llmz's RenderedComponent constrains props to `{}`; fall back to it (not
  // `unknown`) so the generic always satisfies that bound.
  TProps extends {} = T extends Autonomous.Component ? (T['propsType'] extends {} ? T['propsType'] : {}) : {},
> = (message: RenderedComponent<TProps>) => Promise<void> | void

export type ComponentRegistration<T extends Autonomous.Component = Autonomous.Component> = {
  component: T
  handler?: ComponentHandler<T>
}

export class Chat extends _llmzChat {
  private _transcript: TranscriptItem[] | undefined
  private _cursor: TranscriptCursor | undefined

  private client: BotContext['client']
  private conversation: NonNullable<BotContext['conversation']>
  private botId: string
  private logger: BotContext['logger']
  private citations: BotContext['citations']
  private trackedTags: TrackedTags

  private componentRegistry: Map<string, ComponentRegistration> = new Map()

  constructor(context: BotContext) {
    super({
      components: async () => this.getComponents(),
      transcript: async () => this.fetchTranscript(),
      handler: async (message: RenderedComponent) => this.handle(message),
    })

    this.client = context.client
    this.conversation = context.conversation!
    this.botId = context.botId
    this.logger = context.logger
    this.citations = context.citations

    this.trackedTags = TrackedTags.create({
      type: 'conversation',
      client: this.client._inner,
      id: this.conversation.id,
      initialTags: this.conversation.tags,
    })

    // Register default components

    // oxlint-disable-next-line no-explicit-any -- SDK integration type is broader than the const tuple
    if (BUILT_IN_INTEGRATIONS.includes(this.conversation.integration as any)) {
      this.registerComponent({ component: DefaultComponents.Audio })
      this.registerComponent({ component: DefaultComponents.Image })
      this.registerComponent({ component: DefaultComponents.Video })
      this.registerComponent({ component: DefaultComponents.Carousel })
      this.registerComponent({ component: DefaultComponents.Choice })
      this.registerComponent({ component: DefaultComponents.Dropdown })
      this.registerComponent({ component: DefaultComponents.Location })
    } else {
      this.registerComponent({ component: DefaultComponents.Text })
    }
  }

  /**
   * Register a component with an optional handler
   */
  registerComponent<T extends Autonomous.Component>(registration: ComponentRegistration<T>): this {
    const componentName = registration.component.definition.name.toLowerCase()
    this.componentRegistry.set(componentName, registration)
    return this
  }

  /**
   * Remove a component by name
   */
  removeComponent(name: string): this {
    this.componentRegistry.delete(name.toLowerCase())
    return this
  }

  /**
   * Get all registered components
   */
  async getComponents() {
    return Array.from(this.componentRegistry.values()).map((reg) => reg.component)
  }

  /**
   * Clear the entire transcript
   */
  async clearTranscript() {
    this._transcript = []
  }

  /**
   * Prepend items to the transcript
   */
  async prependToTranscript(items: TranscriptItem[]) {
    if (!this._transcript) {
      throw new Error('Transcript not loaded yet – please call fetchTranscript() first')
    }

    this._transcript = [...items, ...this._transcript!]
  }

  /**
   * Get a copy of the current transcript
   */
  async getTranscript(): Promise<TranscriptItem[]> {
    if (!this._transcript) {
      await this.fetchTranscript()
    }

    return [...this._transcript!]
  }

  /**
   * Replace the entire transcript
   */
  async setTranscript(items: TranscriptItem[]): Promise<void> {
    this._transcript = [...items]
  }

  async fetchTranscript() {
    if (this._transcript) return this._transcript
    return await span(
      'chat.fetchTranscript',
      {
        conversationId: this.conversation.id,
      },
      async () => {
        const { state } = await this.client.getOrSetState({
          id: this.conversation.id,
          type: 'conversation',
          name: 'conversation',
          payload: { transcript: [] },
        })
        const payload = state.payload as TranscriptState
        this._transcript = payload.transcript ?? []
        this._cursor = payload.cursor

        // Migration fallback for transcript states written before the cursor
        // lived atomically beside the snapshot.
        const legacySince = this.trackedTags.tags['adkSyncTs' as keyof typeof BUILT_IN_TAGS.conversation] || ''
        if (!this._cursor && legacySince) this._cursor = { createdAt: legacySince }

        const fetchUnseenMessages = async () => {
          return this.client._inner.list
            .messages({
              conversationId: this.conversation.id,
              afterDate:
                !this._cursor?.messageId && this._cursor?.createdAt
                  ? new Date(this._cursor.createdAt).toISOString()
                  : undefined,
              beforeDate: '',
            })
            .collect({ limit: 250 })
            .then((res) => messagesAfterTranscriptCursor(res, this._cursor))
        }

        const unseenMessagesNewestFirst = await fetchUnseenMessages()

        if (unseenMessagesNewestFirst.length > 0) {
          const settled = await Promise.allSettled(
            unseenMessagesNewestFirst.map(async (msg) => {
              await this.addMessage(msg, { advanceCursor: false })
            })
          )

          // A cursor is a contiguous acknowledgement, not a best-effort high
          // watermark. If any transform failed, retain the previous cursor so
          // the next turn retries that gap; already transformed messages are
          // harmlessly de-duplicated by stable message ID.
          if (settled.every((result) => result.status === 'fulfilled')) {
            this._cursor = advanceTranscriptCursor(this._cursor, unseenMessagesNewestFirst[0]!)
            this.trackedTags.tags['adkSyncTs' as keyof typeof BUILT_IN_TAGS.conversation] =
              this._cursor.createdAt
          }
        }

        return this._transcript!
      }
    )
  }

  async compactTranscript() {
    return await span(
      'chat.compactTranscript',
      {
        conversationId: this.conversation.id,
      },
      async () => {
        if (!this._transcript) {
          throw new Error('Transcript not loaded yet – please call fetchTranscript() first')
        }

        const items = this._transcript?.splice(
          0,
          // We want to keep the last N items as higher-precision context
          Math.max(this._transcript.length - Config.Transcript.SUMMARY_END_PADDING, 0)
        )

        try {
          const summary = await adk.zai.summarize(JSON.stringify(items, null, 2), {
            length: Config.Transcript.SUMMARY_TARGET_TOKENS,
            prompt: dedent`
        You are a transcript summarizer tasked with compressing a long conversation between a user and an AI agent.
        Your goal is to drastically reduce the transcript length while retaining all key information, decisions, facts, user goals, and outputs.

        Apply the following rules:
        - Collapse repetitive or verbose exchanges into concise summaries.
        - Remove fluff, filler words, greetings, small talk, and off-topic digressions.
        - If multiple turns convey the same intent or clarification, merge them.
        - Always preserve important questions, answers, decisions, tool calls, results, failures, corrections, and feedback.
        - Prefer bullet points, numbered lists, or structured sections if it increases clarity.
        - Assume the summary will be reused for resuming the session or training the assistant, so it must be precise, useful, and unambiguous.

        The final output should feel like a high-value executive summary of a working session, not a chat log.
        `.trim(),
          })

          this._transcript?.unshift({
            id: `summary-${Date.now()}`,
            role: 'summary',
            content: summary,
          })
        } catch (err) {
          this.logger.error('Error compacting transcript', err)
          this._transcript = [...(items ?? []), ...this._transcript!]
        }
      }
    )
  }

  getRemainingContextSpace(): {
    bytes: number
    messages: number
  } {
    if (!this._transcript) {
      throw new Error('Transcript not loaded yet – please call fetchTranscript() first')
    }

    const transcriptSize = JSON.stringify(this._transcript).length

    return {
      messages: Math.max(0, Config.Transcript.SUMMARY_MAX_MESSAGES - this._transcript.length),
      bytes: Math.max(0, Config.Transcript.SUMMARY_MAX_BYTES - transcriptSize),
    }
  }

  shouldCompactTranscript(): boolean {
    const remaining = this.getRemainingContextSpace()
    return remaining.bytes <= 0 || remaining.messages <= 0
  }

  async saveTranscript() {
    if (!this._transcript) return

    return await span(
      'chat.saveTranscript',
      {
        conversationId: this.conversation.id,
      },
      async () => {
        if (this.shouldCompactTranscript()) {
          await this.compactTranscript()
        }

        // Truncate transcript to fit within storage limits
        // Keep most recent messages, with per-item size limits
        const truncated = truncateTranscript(this._transcript!, {
          maxSize: Config.Transcript.SUMMARY_MAX_BYTES,
          maxSizePerItem: Config.Transcript.TRANSCRIPT_ITEM_MAX_BYTES,
        })

        await this.client.setState({
          id: this.conversation.id,
          type: 'conversation',
          name: 'conversation',
          payload: { transcript: truncated, cursor: this._cursor },
        })
      }
    )
  }

  async sendMessage(message: Msg) {
    assertValidOutgoingMessage(message)

    return await span(
      'chat.sendMessage',
      {
        conversationId: this.conversation.id,
        direction: 'outgoing',
        integration: this.conversation.integration || '-',
        channel: this.conversation.channel || '-',
        userId: this.botId,
        botId: this.botId,
        'message.type': message.type,
        ...(typeof message.payload?.text === 'string' && { 'message.preview': message.payload.text.slice(0, 2000) }),
      },
      async (s) => {
        const [payload, citations] = this.citations.removeCitationsFromObject(message.payload ?? {})

        const { message: created } = await (this.client as unknown as Client).createMessage({
          conversationId: this.conversation.id,
          tags: (message.tags || {}) as { [k: string]: string },
          userId: this.botId,
          // oxlint-disable-next-line no-explicit-any -- SDK message type requires specific string literal union
          type: message.type.toLowerCase() as any,
          payload: {
            ...payload,
            metadata: { citations },
          },
        })

        s.setAttribute('messageId', created.id)

        await this.addMessage(created)

        return created
      }
    )
  }

  async transformMessage(message: APIMessage): Promise<TranscriptItem | null> {
    let clone = structuredClone(message)
    clone = await this.__temporary__fixTelegramImage(clone)

    const attachment = nativeAttachment(clone.type, clone.payload)
    const attachments: Transcript.Attachment[] = attachment ? [attachment] : []

    if (clone.type === 'bloc') {
      const items = Array.isArray(clone.payload.items) ? clone.payload.items : []
      for (const item of items) {
        if (!isPlainRecord(item)) continue
        const itemAttachment = nativeAttachment(item.type, item.payload)
        if (itemAttachment) attachments.push(itemAttachment)
      }
    }

    if (message.direction === 'outgoing') {
      return {
        id: message.id,
        role: 'assistant',
        content: JSON.stringify(
          {
            type: message.type,
            payload: message.payload,
          },
          null,
          2
        ),
        createdAt: message.createdAt,
      }
    }

    if (message.direction === 'incoming') {
      return {
        id: message.id,
        role: 'user',
        content: JSON.stringify(
          {
            type: message.type,
            payload: message.payload,
          },
          null,
          2
        ),
        createdAt: message.createdAt,
        attachments,
      }
    }

    return null
  }

  // oxlint-disable-next-line no-explicit-any -- SDK generic param requires any for AnyIncomingEvent
  async transformEvent(event: AnyIncomingEvent<any>): Promise<TranscriptItem | null> {
    return {
      id: event.id,
      role: 'event',
      name: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
    }
  }

  async handle(message: RenderedComponent) {
    if (message.type === 'MESSAGE') {
      const parsed = Message.parse(message)

      // `props` is a passthrough object, so a `text` prop may be present at
      // runtime even though it is not in the declared schema shape.
      const text = (parsed.props as { text?: unknown }).text
      if (typeof text === 'string') {
        parsed.children.push(text)
      }

      for (const msg of parsed.children) {
        if (isAnyComponent(msg)) {
          await this.handle(msg)
        } else if (typeof msg === 'string' && msg.trim().length) {
          await this.sendMessage({
            type: 'text',
            payload: { text: msg },
          })
        }
      }

      return
    }

    // Check for custom component handler
    const registration = this.componentRegistry.get(message.type.toLowerCase())

    // Try to find by alias if not found by name
    let componentRegistration = registration
    if (!componentRegistration) {
      for (const [_, reg] of this.componentRegistry) {
        if (reg.component.definition.aliases?.map((x) => x.toLowerCase()).includes(message.type.toLowerCase())) {
          componentRegistration = reg
          break
        }
      }
    }

    if (!componentRegistration) {
      throw new Error(`Could not find component for message type "${message.type}"`)
    }

    // Use custom handler if provided
    if (componentRegistration.handler) {
      await componentRegistration.handler(message)
      return
    }

    // Default handler: send message via Botpress API
    await this.sendMessage({
      type: componentRegistration.component.definition.name,
      payload: message.props,
    })
  }

  /**
   * This is a temporary workaround as the Content-Type of images on Telegram are "binary/octet-stream"
   * And OpenAI integration does not support this type. It needs to be "image/jpeg" or "image/png".
   * This function fetches the image from Telegram, uploads it to the file storage, and replaces the URL in the message.
   */
  // oxlint-disable-next-line no-explicit-any -- SDK generic param requires any for AnyIncomingMessage
  async __temporary__fixTelegramImage(message: AnyIncomingMessage<any>): Promise<AnyIncomingMessage<any>> {
    if (this.conversation.integration !== 'telegram') {
      return message
    }

    const clone = structuredClone(message)

    if (clone.type === 'image' && clone.payload.imageUrl) {
      const arrayBuffer = await (await fetch(clone.payload.imageUrl)).arrayBuffer()

      const buffer = Buffer.from(arrayBuffer)

      // Strip any query string before taking the last path segment: our cloudapi image
      // URLs are query-form (…/v1/files/download?key=telegram%2F<id>), so a bare
      // split('/').pop() would yield "download?key=…" and corrupt the upload key.
      const fileName = clone.payload.imageUrl.split('?')[0]!.split('/').pop() || 'image.jpg'

      const { file } = await this.client.uploadFile({
        key: `telegram/${this.conversation.id}/${clone.id}/${fileName}`,
        content: buffer,
        index: false,
        accessPolicies: ['public_content'],
        publicContentImmediatelyAccessible: true,
      })

      clone.payload.imageUrl = file.url
    }

    return clone
  }

  // oxlint-disable-next-line no-explicit-any -- SDK generic params require any for AnyIncomingEvent
  async addEvent(event: AnyIncomingEvent<any> | { id: string; type: string; payload: unknown; createdAt: string }) {
    if (!isEvent(event)) {
      return
    }

    const item = await this.transformEvent(event)

    if (!item || this._transcript?.find((m) => m.id === event.id)) {
      return
    }

    // find the index where it should be inserted to keep chronological order
    let insertIndex = this._transcript?.findIndex(
      (m) => m.createdAt && new Date(m.createdAt) > new Date(event.createdAt)
    )

    this._transcript?.splice(
      insertIndex === -1 || insertIndex === undefined ? this._transcript.length : insertIndex,
      0,
      item
    )
  }

  // oxlint-disable-next-line no-explicit-any -- SDK generic param requires any for AnyIncomingMessage
  async addMessage(message: AnyIncomingMessage<any>, options: { advanceCursor?: boolean } = {}) {
    if (!isMessage(message)) {
      return
    }

    const item = await this.transformMessage(message)
    if (!item) return

    const existingIndex = this._transcript?.findIndex((m) => m.id === message.id) ?? -1

    if (existingIndex >= 0) {
      const existing = this._transcript![existingIndex]!
      if (transcriptContent(existing) === transcriptContent(item) && sameAttachments(existing, item)) {
        // Redelivery of an already-transcribed message (e.g. a Telegram bloc retry) with no
        // new content — the platform's trailing-edge touch can repeat delivery verbatim.
        return
      }

      // Trailing-edge redelivery of a bloc carries the fuller payload (more album parts);
      // upsert in place instead of leaving the transcript stuck on the first partial version.
      // The cursor is deliberately left untouched below: this id already advanced it (or was
      // covered by a batch advance) on its first delivery, and advanceTranscriptCursor trusts
      // whatever message it is given, so replaying this older message here would regress the
      // durable watermark behind messages that arrived — and were cursor-advanced — since.
      this._transcript![existingIndex] = { ...item, id: message.id }
      return
    }

    // find the index where it should be inserted to keep chronological order
    let insertIndex = this._transcript?.findIndex(
      (m) => m.createdAt && item.createdAt && new Date(m.createdAt) > new Date(item.createdAt)
    )

    this._transcript?.splice(
      insertIndex === -1 || insertIndex === undefined ? this._transcript.length : insertIndex,
      0,
      item
    )

    if (options.advanceCursor !== false) {
      this._cursor = advanceTranscriptCursor(this._cursor, message)
      this.trackedTags.tags['adkSyncTs' as keyof typeof BUILT_IN_TAGS.conversation] = this._cursor.createdAt
    }
  }
}
