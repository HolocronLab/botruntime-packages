import { describe, expect, it } from 'vitest'

import type { Message } from '@holocronlab/botruntime-client'

import type { BotContext } from '../context/context'
import { Chat } from './chat'
import { TranscriptSchema } from './transcript'

const createChat = () => {
  const botContext = {
    botId: 'bot-1',
    client: { _inner: {} },
    conversation: {
      id: 'conversation-1',
      integration: 'botruntime/telegram',
      channel: 'channel',
      tags: {},
    },
    logger: { error: () => undefined },
    citations: { removeCitationsFromObject: (value: unknown) => [value, []] },
  } as unknown as BotContext

  return new Chat(botContext)
}

const incomingMessage = (type: string, payload: Record<string, unknown>): Message =>
  ({
    id: 'message-1',
    createdAt: '2026-07-20T20:00:00Z',
    updatedAt: '2026-07-20T20:00:00Z',
    conversationId: 'conversation-1',
    userId: 'user-1',
    direction: 'incoming',
    type,
    payload,
    tags: {},
  }) as Message

describe('Chat native attachments', () => {
  it('exposes an incoming PDF file natively while preserving stable file metadata in content', async () => {
    const message = incomingMessage('file', {
      fileUrl: 'https://files.example/download?id=contract',
      title: 'contract.bin',
      contentType: 'application/pdf',
      fileId: 'file_01',
      providerFileId: 'telegram_01',
    })

    const transformed = await createChat().transformMessage(message)

    expect(transformed).toMatchObject({
      role: 'user',
      attachments: [
        {
          type: 'file',
          url: 'https://files.example/download?id=contract',
          mimeType: 'application/pdf',
          title: 'contract.bin',
        },
      ],
    })
    expect(JSON.parse((transformed as { content: string }).content)).toEqual({
      type: 'file',
      payload: message.payload,
    })
    expect(TranscriptSchema.parse([transformed])).toMatchObject([
      {
        attachments: [{ type: 'file', mimeType: 'application/pdf' }],
      },
    ])
  })

  it.each([
    [{ fileUrl: 'https://files.example/download', title: 'contract.PDF' }],
    [{ fileUrl: 'https://files.example/contracts/contract.pdf?signature=secret', title: 'contract' }],
  ])('recognizes a PDF from its title or URL when contentType is missing', async (payload) => {
    const transformed = await createChat().transformMessage(incomingMessage('file', payload))

    expect(transformed).toMatchObject({
      attachments: [{ type: 'file', mimeType: 'application/pdf' }],
    })
  })

  it('does not expose unsupported files as native model attachments', async () => {
    const transformed = await createChat().transformMessage(
      incomingMessage('file', {
        fileUrl: 'https://files.example/contract.docx',
        title: 'contract.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileId: 'file_02',
      })
    )

    expect(transformed).toMatchObject({ role: 'user', attachments: [] })
  })

  it('extracts images and PDFs from a bloc but leaves unsupported files non-native', async () => {
    const transformed = await createChat().transformMessage(
      incomingMessage('bloc', {
        items: [
          { type: 'image', payload: { imageUrl: 'https://files.example/photo.jpg', fileId: 'image_01' } },
          {
            type: 'file',
            payload: {
              fileUrl: 'https://files.example/contract',
              title: 'contract.pdf',
              fileId: 'pdf_01',
            },
          },
          {
            type: 'file',
            payload: {
              fileUrl: 'https://files.example/contract.docx',
              title: 'contract.docx',
              fileId: 'docx_01',
            },
          },
        ],
      })
    )

    expect(transformed).toMatchObject({
      attachments: [
        { type: 'image', url: 'https://files.example/photo.jpg' },
        {
          type: 'file',
          url: 'https://files.example/contract',
          mimeType: 'application/pdf',
          title: 'contract.pdf',
        },
      ],
    })
  })
})
