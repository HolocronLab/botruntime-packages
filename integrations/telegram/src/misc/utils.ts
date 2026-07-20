import { RuntimeError } from '@holocronlab/botruntime-sdk'
import { AssertionError } from 'assert'
import { ok } from 'assert'
import _ from 'lodash'
import { Context, Markup, Telegraf, Telegram, TelegramError } from 'telegraf'
import type { Update, User, Sticker } from 'telegraf/types'
import { ingestTelegramFileLink, resolveTelegramMedia } from './files'
import { telegramTextMsgToStdMarkdown } from './telegram-to-markdown'
import type {
  AckFunction,
  Card,
  Conversation,
  HandlerProps,
  HandlerResponse,
  Logger,
  Message,
  TelegramMessage,
} from './types'

export const mapToRuntimeErrorAndThrow =
  (message: string) =>
  (thrown: unknown): never => {
    if (thrown instanceof TelegramError) {
      throw new RuntimeError(`${message}: ${thrown.description}`, thrown)
    }

    throw thrown instanceof Error
      ? new RuntimeError(`${message}: ${thrown.message}`, thrown)
      : new RuntimeError(`${message}: ${thrown}`)
  }

export async function ackMessage(message: TelegramMessage, ack: AckFunction, operation?: string) {
  await ack({ tags: { id: `${message.message_id}`, ...(operation ? { 'botruntime.delivery.operation': operation } : {}) } })
}

export async function sendCard(
  payload: Card,
  client: Telegraf<Context<Update>>,
  chat: string,
  ack: AckFunction,
  thread: { message_thread_id?: number } = {},
) {
  const text = `*${payload.title}*${payload.subtitle ? '\n' + payload.subtitle : ''}`
  const buttons = payload.actions
    .filter((item) => item.value && item.label)
    .map((item) => {
      switch (item.action) {
        case 'url':
          return Markup.button.url(item.label, item.value)
        case 'postback':
          return Markup.button.callback(item.label, `postback:${item.value}`)
        case 'say':
          return Markup.button.callback(item.label, `say:${item.value}`)
        default:
          throw new RuntimeError(`Unknown action type: ${item.action}`)
      }
    })
  if (payload.imageUrl) {
    const media = await resolveTelegramMedia(payload.imageUrl)
    const message = await client.telegram
      .sendPhoto(chat, media, {
        caption: text,
        parse_mode: 'MarkdownV2',
        ...thread,
        ...Markup.inlineKeyboard(buttons),
      })
      .catch(mapToRuntimeErrorAndThrow('Fail to send photo'))
    await ackMessage(message, ack)
  } else {
    const message = await client.telegram
      .sendMessage(chat, text, {
        parse_mode: 'MarkdownV2',
        ...thread,
        ...Markup.inlineKeyboard(buttons),
      })
      .catch(mapToRuntimeErrorAndThrow('Fail to send message'))
    await ackMessage(message, ack)
  }
}

export function getChat(conversation: Conversation): string {
  const chat = conversation.tags.chatId

  if (!chat) {
    throw new RuntimeError(`No chat found for conversation ${conversation.id}`)
  }

  return chat
}

export function getMessageId(message: Message): number {
  const messageId = message.tags.id

  if (!messageId) {
    throw new RuntimeError(`No message ID found for message ${message.id}`)
  }

  return Number(messageId)
}

export const getUserNameFromTelegramUser = (telegramUser: User) => {
  if (telegramUser.first_name && telegramUser.last_name) {
    return `${telegramUser.first_name} ${telegramUser.last_name}`
  } else if (telegramUser.username) {
    return telegramUser.username
  }
  return telegramUser.first_name
}

export type IncomingMessage = { type: string; payload: Record<string, unknown> }

async function ingestById(
  telegram: Telegram,
  fileId: string,
  fileUniqueId: string,
  contentType: string,
  message: TelegramMessage,
  filename?: string,
) {
  const link = await telegram.getFileLink(fileId).catch(mapToRuntimeErrorAndThrow('Fail to get file link'))
  return ingestTelegramFileLink(link.href, `telegram/${fileUniqueId}`, contentType, {
    providerFileId: fileId,
    providerFileUniqueId: fileUniqueId,
    providerMessageId: String(message.message_id),
    providerMediaGroupId: mediaGroupId(message),
    filename,
  })
}

function storedFilePayload(
  file: Awaited<ReturnType<typeof ingestById>>,
  message: TelegramMessage,
  providerFileId: string,
  providerFileUniqueId: string,
  filename?: string,
) {
  return {
    fileId: file.id,
    ...(filename ? { filename } : {}),
    contentType: file.contentType,
    size: file.size,
    providerFileId,
    providerFileUniqueId,
    providerMessageId: String(message.message_id),
    ...(mediaGroupId(message) ? { providerMediaGroupId: mediaGroupId(message) } : {}),
  }
}

function mediaGroupId(message: TelegramMessage): string | undefined {
  return 'media_group_id' in message && typeof message.media_group_id === 'string' ? message.media_group_id : undefined
}

export const convertTelegramMessageToBotpressMessage = async ({
  message,
  telegram,
  logger,
}: {
  message: TelegramMessage
  telegram: Telegram
  logger: Logger
}): Promise<IncomingMessage> => {
  if ('photo' in message) {
    const photo = _.maxBy(message.photo, (p) => p.height * p.width)
    ok(photo, 'No photo found in message')
    const file = await ingestById(telegram, photo.file_id, photo.file_unique_id, 'image/jpeg', message)
    return {
      type: 'image',
      payload: { imageUrl: file.url, ...storedFilePayload(file, message, photo.file_id, photo.file_unique_id) },
    }
  }

  if ('sticker' in message) {
    const sticker = (message as TelegramMessage & { sticker: Sticker }).sticker
    const file = await ingestById(telegram, sticker.file_id, sticker.file_unique_id, 'image/webp', message)
    return {
      type: 'image',
      payload: { imageUrl: file.url, ...storedFilePayload(file, message, sticker.file_id, sticker.file_unique_id) },
    }
  }

  if ('audio' in message) {
    const file = await ingestById(
      telegram,
      message.audio.file_id,
      message.audio.file_unique_id,
      message.audio.mime_type ?? 'audio/mpeg',
      message,
      message.audio.file_name,
    )
    return {
      type: 'audio',
      payload: {
        audioUrl: file.url,
        ...storedFilePayload(file, message, message.audio.file_id, message.audio.file_unique_id, message.audio.file_name),
      },
    }
  }

  if ('voice' in message) {
    const file = await ingestById(
      telegram,
      message.voice.file_id,
      message.voice.file_unique_id,
      message.voice.mime_type ?? 'audio/ogg',
      message,
    )
    return {
      type: 'audio',
      payload: { audioUrl: file.url, ...storedFilePayload(file, message, message.voice.file_id, message.voice.file_unique_id) },
    }
  }

  if ('video' in message) {
    const file = await ingestById(
      telegram,
      message.video.file_id,
      message.video.file_unique_id,
      message.video.mime_type ?? 'video/mp4',
      message,
      message.video.file_name,
    )
    return {
      type: 'video',
      payload: {
        videoUrl: file.url,
        ...storedFilePayload(file, message, message.video.file_id, message.video.file_unique_id, message.video.file_name),
      },
    }
  }

  if ('document' in message) {
    const contentType = message.document.mime_type ?? 'application/octet-stream'
    const filename = message.document.file_name
    const file = await ingestById(
      telegram,
      message.document.file_id,
      message.document.file_unique_id,
      contentType,
      message,
      filename,
    )
    return {
      type: 'file',
      payload: {
        fileUrl: file.url,
        title: filename ?? 'файл',
        mimeType: contentType,
        ...storedFilePayload(file, message, message.document.file_id, message.document.file_unique_id, filename),
      },
    }
  }

  if ('text' in message) {
    const { text, warnings } = telegramTextMsgToStdMarkdown(message.text, message.entities)
    warnings?.forEach((warningMsg) => logger.forBot().warn(warningMsg))
    return { type: 'text', payload: { text } }
  }

  if ('location' in message) {
    return {
      type: 'location',
      payload: { latitude: message.location.latitude, longitude: message.location.longitude },
    }
  }

  // GAP (request_contact inbound): a shared contact arrives as message.contact. The donor has no
  // such branch (it throws -> the phone is lost). We surface the phone number as a text message so
  // the bot's consent/share-phone flow captures it from the conversation history.
  if ('contact' in message) {
    return { type: 'text', payload: { text: message.contact.phone_number } }
  }

  throw new RuntimeError(`Unsupported message type from Telegram: ${JSON.stringify(message)}`)
}

type Handler = (args: HandlerProps) => Promise<HandlerResponse>

// Ignorable Telegram updates are signalled with `ok(...)` assertions: swallow ONLY those (ack 200 so
// Telegram does not retry). A genuine processing failure (createMessage/ingest) is rethrown to fail
// loud (the host turns it into a visible 500) — never silently dropped (the donor swallowed ALL
// throws, which is how a new user with a profile photo could lose their first message; CLAUDE.md).
export const wrapHandler =
  (handler: Handler): Handler =>
  async (args: HandlerProps): Promise<HandlerResponse> => {
    try {
      return await handler(args)
    } catch (thrown) {
      if (thrown instanceof AssertionError) {
        args.logger.forBot().debug('Ignored Telegram update:', thrown.message)
        return { status: 200 }
      }
      throw thrown
    }
  }
