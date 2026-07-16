import { describe, expect, test } from 'bun:test'
import { conversationTagId, threadExtra, topicThreadId } from './threading'

describe('topicThreadId', () => {
  test('returns the Telegram forum topic id', () => {
    expect(topicThreadId({ is_topic_message: true, message_thread_id: 42 })).toBe('42')
  })

  test('does not treat a non-forum reply thread as a forum topic', () => {
    expect(topicThreadId({ message_thread_id: 42 })).toBeUndefined()
  })
})

describe('conversationTagId', () => {
  test('keeps the existing direct-message identity', () => {
    expect(conversationTagId('123', undefined)).toBe('123')
  })

  test('keeps forum topics separate from the supergroup general chat', () => {
    expect(conversationTagId('-1003879237749', '42')).toBe('-1003879237749/42')
  })
})

describe('threadExtra', () => {
  test('addresses outbound messages to the forum topic', () => {
    expect(threadExtra({ id: 'c1', tags: { chatId: '-100', threadId: '42' } })).toEqual({
      message_thread_id: 42,
    })
  })

  test('fails loudly instead of leaking a topic message into the general chat', () => {
    expect(() => threadExtra({ id: 'c1', tags: { chatId: '-100', threadId: 'oops' } })).toThrow(
      /Malformed threadId tag/,
    )
  })
})
