import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import packageJson from '../package.json'

test('the 5s album settle window ships with Telegram 1.2.2', () => {
  expect((definition as { version: string }).version).toBe('1.2.2')
  expect(packageJson.version).toBe('1.2.2')
  expect((definition as unknown as { actions: Record<string, unknown> }).actions).toHaveProperty('createForumTopic')
})
