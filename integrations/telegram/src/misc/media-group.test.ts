import { describe, expect, test } from 'bun:test'
import { telegramMessageChannels } from '../../definitions/channels'
import { persistInboundTelegramMessage } from './media-group'

type StoredMessage = {
  id: string
  type: string
  payload: Record<string, unknown>
  tags: Record<string, string>
}

const image = (providerMessageId: string, providerUpdateId: string, caption?: string) => ({
  type: 'image',
  payload: {
    imageUrl: `https://files.test/${providerMessageId}`,
    fileId: `telegram/file-${providerMessageId}`,
    contentType: 'image/jpeg',
    size: 123,
    providerFileId: `provider-${providerMessageId}`,
    providerFileUniqueId: `unique-${providerMessageId}`,
    providerMessageId,
    providerMediaGroupId: 'album-7',
    providerUpdateId,
    ...(caption ? { caption } : {}),
  },
})

const makeClient = () => {
  let stored: StoredMessage | undefined
  const creates: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  return {
    creates,
    updates,
    get stored() {
      return stored
    },
    client: {
      async getOrCreateMessage(input: Record<string, unknown>) {
        creates.push(input)
        if (!stored) {
          stored = {
            id: 'runtime-message-1',
            type: String(input.type),
            payload: input.payload as Record<string, unknown>,
            tags: input.tags as Record<string, string>,
          }
          return { message: stored, meta: { created: true } }
        }
        return { message: stored, meta: { created: false } }
      },
      async updateMessage(input: Record<string, unknown>) {
        updates.push(input)
        if (!stored) throw new Error('message not created')
        stored = { ...stored, payload: input.payload as Record<string, unknown> }
        return { message: stored }
      },
    },
  }
}

const common = {
  webhookId: 'wh-1',
  chatId: '42',
  userId: 'user-1',
  conversationId: 'conversation-1',
}

describe('persistInboundTelegramMessage', () => {
  test('keeps a non-album message on the immediate legacy path', async () => {
    const harness = makeClient()
    await persistInboundTelegramMessage({
      ...common,
      client: harness.client,
      messageId: '10',
      updateId: '100',
      message: { type: 'text', payload: { text: 'hello' } },
    })

    expect(harness.creates).toHaveLength(1)
    expect(harness.creates[0]).toMatchObject({
      type: 'text',
      payload: { text: 'hello' },
      tags: { id: '10', chatId: '42', updateId: '100', webhookId: 'wh-1' },
      discriminateByTags: ['webhookId', 'updateId'],
    })
    expect(harness.creates[0]?.schedule).toBeUndefined()
    expect(harness.updates).toHaveLength(0)
  })

  test('creates one scheduled bloc and appends later album parts in provider message order', async () => {
    const harness = makeClient()
    await persistInboundTelegramMessage({
      ...common,
      client: harness.client,
      messageId: '12',
      updateId: '102',
      mediaGroupId: 'album-7',
      message: image('12', '102'),
    })
    await persistInboundTelegramMessage({
      ...common,
      client: harness.client,
      messageId: '11',
      updateId: '101',
      mediaGroupId: 'album-7',
      message: image('11', '101', 'ДДУ и акт'),
    })

    expect(harness.creates).toHaveLength(2)
    expect(harness.creates[0]).toMatchObject({
      type: 'bloc',
      payload: { items: [image('12', '102')] },
      schedule: { delay: 2000 },
      tags: { id: '12', chatId: '42', updateId: '102', webhookId: 'wh-1', mediaGroupId: 'album-7' },
      discriminateByTags: ['webhookId', 'chatId', 'mediaGroupId'],
    })
    // Every touch — first part and later parts alike — carries the trailing-edge schedule;
    // it is what shifts the platform's delivery moment to now+delay on each part.
    expect(harness.creates[1]).toMatchObject({
      schedule: { delay: 2000 },
      tags: { id: '11', chatId: '42', updateId: '101', webhookId: 'wh-1', mediaGroupId: 'album-7' },
      discriminateByTags: ['webhookId', 'chatId', 'mediaGroupId'],
    })
    expect(harness.updates).toHaveLength(1)
    expect(harness.stored?.payload).toEqual({ items: [image('11', '101', 'ДДУ и акт'), image('12', '102')] })
    const parsed = telegramMessageChannels.bloc.schema.parse(harness.stored!.payload)
    expect(parsed).toEqual(harness.stored!.payload as typeof parsed)
  })

  test('deduplicates Telegram retries by provider message id or update id', async () => {
    const harness = makeClient()
    const first = image('11', '101', 'caption once')
    await persistInboundTelegramMessage({
      ...common, client: harness.client, messageId: '11', updateId: '101', mediaGroupId: 'album-7', message: first,
    })
    await persistInboundTelegramMessage({
      ...common, client: harness.client, messageId: '11', updateId: '999', mediaGroupId: 'album-7', message: image('11', '999', 'duplicate'),
    })
    await persistInboundTelegramMessage({
      ...common, client: harness.client, messageId: '99', updateId: '101', mediaGroupId: 'album-7', message: image('99', '101', 'duplicate'),
    })

    expect(harness.updates).toHaveLength(0)
    expect(harness.stored?.payload).toEqual({ items: [first] })
  })

  const sendPart = async (harness: ReturnType<typeof makeClient>, n: number) =>
    persistInboundTelegramMessage({
      ...common,
      client: harness.client,
      messageId: String(n),
      updateId: String(100 + n),
      mediaGroupId: 'album-7',
      message: image(String(n), String(100 + n)),
    })

  test('does not flush before the Telegram 10-item album cap is reached', async () => {
    const harness = makeClient()
    for (let n = 1; n <= 9; n++) await sendPart(harness, n)

    // One get-or-create touch per part (all trailing-edge, delay 2000), no extra delay:0 flush.
    expect(harness.creates).toHaveLength(9)
    for (const create of harness.creates) {
      expect(create).toMatchObject({ schedule: { delay: 2000 } })
    }
    expect(harness.updates).toHaveLength(8)
    expect((harness.stored?.payload as { items: unknown[] }).items).toHaveLength(9)
  })

  test('flushes immediately with a delay:0 touch once the 10th part fills the album', async () => {
    const harness = makeClient()
    for (let n = 1; n <= 10; n++) await sendPart(harness, n)

    expect(harness.updates).toHaveLength(9)
    expect((harness.stored?.payload as { items: unknown[] }).items).toHaveLength(10)

    // One touch per part (10) plus exactly one extra flush touch right after the 10th update.
    expect(harness.creates).toHaveLength(11)
    expect(harness.creates[harness.creates.length - 1]).toMatchObject({
      type: 'bloc',
      schedule: { delay: 0 },
      tags: { id: '10', chatId: '42', updateId: '110', webhookId: 'wh-1', mediaGroupId: 'album-7' },
      discriminateByTags: ['webhookId', 'chatId', 'mediaGroupId'],
    })
  })

  test('a duplicate delivery at 9 existing items does not update or flush', async () => {
    const harness = makeClient()
    for (let n = 1; n <= 9; n++) await sendPart(harness, n)

    const createsBeforeDuplicate = harness.creates.length
    const updatesBeforeDuplicate = harness.updates.length

    await persistInboundTelegramMessage({
      ...common,
      client: harness.client,
      messageId: '5',
      updateId: '105',
      mediaGroupId: 'album-7',
      message: image('5', '105', 'duplicate retry'),
    })

    // The touch itself still runs (trailing-edge debounce keeps working for retries), but
    // isDuplicate short-circuits before update/flush.
    expect(harness.creates).toHaveLength(createsBeforeDuplicate + 1)
    expect(harness.creates[harness.creates.length - 1]).toMatchObject({ schedule: { delay: 2000 } })
    expect(harness.updates).toHaveLength(updatesBeforeDuplicate)
  })
})
