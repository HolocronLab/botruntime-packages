import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import packageJson from '../package.json'

test('durable forum-topic provisioning ships with Telegram 1.2.3', () => {
  expect((definition as { version: string }).version).toBe('1.2.3')
  expect(packageJson.version).toBe('1.2.3')
  const action = (
    definition as unknown as {
      actions: Record<string, { attributes?: Record<string, string> }>
    }
  ).actions.createForumTopic
  expect(action).toBeDefined()
  expect(action?.attributes?.['botruntime.durableOperation']).toBe('v1')
})
