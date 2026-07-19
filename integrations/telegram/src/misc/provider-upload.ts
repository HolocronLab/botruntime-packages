import { TelegramError } from 'telegraf'
import type { TelegramMedia } from './files'
import type { TelegramMessage } from './types'

type BufferedTelegramMedia = Extract<TelegramMedia, { source: Buffer }>

type TelegramResponse = {
  ok: boolean
  result?: TelegramMessage
  error_code?: number
  description?: string
}

export async function sendDocumentUpload(args: {
  botToken: string
  chatId: number | string
  media: BufferedTelegramMedia
  caption?: string
  messageThreadId?: number
  signal?: AbortSignal
}): Promise<TelegramMessage> {
  const body = new FormData()
  body.set('chat_id', String(args.chatId))
  if (args.caption) body.set('caption', args.caption)
  if (args.messageThreadId !== undefined) body.set('message_thread_id', String(args.messageThreadId))
  body.set(
    'document',
    new Blob([Uint8Array.from(args.media.source)], { type: contentTypeOf(args.media.filename) }),
    args.media.filename,
  )

  let response: Response
  try {
    response = await fetch(`https://api.telegram.org/bot${args.botToken}/sendDocument`, {
      method: 'POST',
      body,
      signal: args.signal,
    })
  } catch (error) {
    throw safeTransportError(error)
  }
  const payload = await telegramResponse(response)
  if (!payload.ok) {
    throw new TelegramError({
      error_code: Number.isInteger(payload.error_code) ? payload.error_code! : response.status,
      description: payload.description || 'Telegram rejected the document upload',
    })
  }
  if (!payload.result) throw new Error('Telegram document upload response did not contain an ACK')
  return payload.result
}

async function telegramResponse(response: Response): Promise<TelegramResponse> {
  try {
    return await response.json() as TelegramResponse
  } catch {
    throw new Error('Telegram document upload response was not valid JSON')
  }
}

function safeTransportError(error: unknown): Error {
  const safe = new Error('Telegram document upload transport failed')
  if (error instanceof Error && error.name) safe.name = error.name
  return safe
}

function contentTypeOf(filename: string): string {
  if (filename.toLowerCase().endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  return 'application/octet-stream'
}
