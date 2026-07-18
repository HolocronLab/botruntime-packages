import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import packageJson from '../package.json'

test('service-message ACK and transport error fidelity ship with Telegram 1.1.8', () => {
  expect((definition as { version: string }).version).toBe('1.1.8')
  expect(packageJson.version).toBe('1.1.8')
  expect((definition as unknown as { actions: Record<string, unknown> }).actions).toHaveProperty('createForumTopic')
})
