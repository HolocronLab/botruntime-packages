import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import packageJson from '../package.json'

test('atomic media-group batching ships with Telegram 1.2.0', () => {
  expect((definition as { version: string }).version).toBe('1.2.0')
  expect(packageJson.version).toBe('1.2.0')
  expect((definition as unknown as { actions: Record<string, unknown> }).actions).toHaveProperty('createForumTopic')
})
