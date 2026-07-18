import { describe, expect, it } from 'vitest'

import { advanceTranscriptCursor, messagesAfterTranscriptCursor } from './transcript-sync'

type Message = { id: string; createdAt: string }

const message = (id: string, createdAt: string): Message => ({ id, createdAt })

describe('durable transcript cursor', () => {
  it('uses the stable message identity when several messages share a timestamp', () => {
    const messages = [
      message('m-4', '2026-07-18T19:39:23Z'),
      message('m-3', '2026-07-18T19:39:23Z'),
      message('m-2', '2026-07-18T19:38:22Z'),
    ]

    expect(
      messagesAfterTranscriptCursor(messages, {
        messageId: 'm-3',
        createdAt: '2026-07-18T19:39:23Z',
      })
    ).toEqual([messages[0]])
  })

  it('falls back to the legacy timestamp when migrating an old transcript state', () => {
    const messages = [
      message('m-3', '2026-07-18T19:40:00Z'),
      message('m-2', '2026-07-18T19:39:00Z'),
      message('m-1', '2026-07-18T19:38:00Z'),
    ]

    expect(messagesAfterTranscriptCursor(messages, { createdAt: '2026-07-18T19:38:30Z' })).toEqual([
      messages[0],
      messages[1],
    ])
  })

  it('re-consumes a bounded page when the stable cursor fell outside it', () => {
    const messages = [
      message('m-4', '2026-07-18T19:39:23Z'),
      message('m-3', '2026-07-18T19:39:23Z'),
    ]

    expect(
      messagesAfterTranscriptCursor(messages, {
        messageId: 'm-outside-page',
        createdAt: '2026-07-18T19:39:23Z',
      })
    ).toEqual(messages)
  })

  it('advances by canonical message identity even when a provider timestamp moves backwards', () => {
    const latest = { messageId: 'm-3', createdAt: '2026-07-18T19:40:00Z' }

    expect(advanceTranscriptCursor(latest, message('m-4', '2026-07-18T19:39:00Z'))).toEqual({
      messageId: 'm-4',
      createdAt: '2026-07-18T19:39:00Z',
    })
    expect(advanceTranscriptCursor(latest, message('m-4', '2026-07-18T19:41:00Z'))).toEqual({
      messageId: 'm-4',
      createdAt: '2026-07-18T19:41:00Z',
    })
  })
})
