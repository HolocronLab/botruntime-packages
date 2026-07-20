import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import packageJson from '../package.json'

test('the 10-item album trailing-edge flush ships with Telegram 1.2.1', () => {
  expect((definition as { version: string }).version).toBe('1.2.1')
  expect(packageJson.version).toBe('1.2.1')
  expect((definition as unknown as { actions: Record<string, unknown> }).actions).toHaveProperty('createForumTopic')
})
