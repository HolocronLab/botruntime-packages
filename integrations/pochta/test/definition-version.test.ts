import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import packageJson from '../package.json'

test('the safe registration error ships with Pochta 0.1.1', () => {
  expect((definition as { version: string }).version).toBe('0.1.1')
  expect(packageJson.version).toBe('0.1.1')
})
