import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import packageJson from '../package.json'

test('native proxied document upload ships with Telegram 1.1.11', () => {
  expect((definition as { version: string }).version).toBe('1.1.11')
  expect(packageJson.version).toBe('1.1.11')
  expect((definition as unknown as { actions: Record<string, unknown> }).actions).toHaveProperty('createForumTopic')
})
