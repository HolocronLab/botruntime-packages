import { z } from '@holocronlab/botruntime-sdk'

import type { TranscriptCursor } from './transcript-sync'

export type TranscriptAttachment = {
  type: 'image' | 'file'
  url: string
  mimeType?: string
  title?: string
}

export type TranscriptAssistantMessage = {
  id: string
  role: 'assistant'
  name?: string
  createdAt?: string
  content: string
}

export type TranscriptUserMessage = {
  id: string
  role: 'user'
  createdAt?: string
  name?: string
  content: string
  attachments?: Array<TranscriptAttachment>
}

export type TranscriptEventMessage = {
  id: string
  role: 'event'
  createdAt?: string
  name: string
  payload: unknown
  attachments?: Array<TranscriptAttachment>
}

export type TranscriptSummaryMessage = {
  id: string
  role: 'summary'
  content: string
  createdAt?: string
  attachments?: Array<TranscriptAttachment>
}

export type TranscriptItem =
  | TranscriptAssistantMessage
  | TranscriptUserMessage
  | TranscriptEventMessage
  | TranscriptSummaryMessage

const AttachmentSchema = z.object({
  type: z.union([z.literal('image'), z.literal('file')]),
  url: z.string(),
  mimeType: z.string().optional(),
  title: z.string().optional(),
})

// There's a bug in the bridge, we can't use unions and discriminated unions.
// The resulting type will be the lowest common denominator and attachments will be stripped
// So instead we use a single schema that is flexible enough to handle all types of messages
const TranscriptItemSchema = z.object({
  id: z.string(),
  role: z.union([z.literal('assistant'), z.literal('user'), z.literal('event'), z.literal('summary')]),
  name: z.string().optional(),
  createdAt: z.string().optional(),
  content: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  payload: z.unknown().optional(),
})

export const TranscriptSchema = z.array(TranscriptItemSchema)

export const TranscriptCursorSchema = z.object({
  messageId: z.string().optional(),
  createdAt: z.string().optional(),
})

export const TranscriptStateSchema = z.object({
  transcript: TranscriptSchema,
  cursor: TranscriptCursorSchema.optional(),
})

export type TranscriptState = {
  transcript: TranscriptItem[]
  cursor?: TranscriptCursor
}
