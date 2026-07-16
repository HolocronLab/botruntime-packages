import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import packageJson from '../package.json'

test('forum topics and config-first credentials ship as Telegram 1.1.5', () => {
  expect((definition as { version: string }).version).toBe('1.1.5')
  expect(packageJson.version).toBe('1.1.5')
  expect((definition as unknown as { actions: Record<string, unknown> }).actions).toHaveProperty('createForumTopic')
})
