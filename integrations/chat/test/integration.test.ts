import { expect, test } from 'bun:test'
import integration, { handler } from '../src/index'

test('chat bundle exports the runtime handler and every declared channel message handler', () => {
  expect(typeof handler).toBe('function')
  expect(typeof integration.handler).toBe('function')

  const messages = (integration as any).channels.channel.messages
  for (const type of ['text', 'image', 'audio', 'video', 'file', 'location', 'carousel', 'card', 'dropdown', 'choice', 'bloc']) {
    expect(typeof messages[type]).toBe('function')
  }
})
