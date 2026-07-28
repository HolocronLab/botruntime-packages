import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import packageJson from '../package.json'

test('fail-closed forum-topic provisioning ships with Telegram 1.2.4', () => {
  expect((definition as { version: string }).version).toBe('1.2.4')
  expect(packageJson.version).toBe('1.2.4')
  const action = (
    definition as unknown as {
      actions: Record<string, { attributes?: Record<string, string> }>
    }
  ).actions.createForumTopic
  expect(action).toBeDefined()
  expect(action?.attributes?.['botruntime.durableOperation']).toBeUndefined()
  expect(action?.attributes?.['botruntime.operationCheckpoint']).toBeUndefined()
})
