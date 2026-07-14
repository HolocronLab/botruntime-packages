import { expect, test } from 'bun:test'
import definition from '../integration.definition'
import packageJson from '../package.json'

test('protected Botruntime document delivery ships as the next public Telegram version', () => {
  expect((definition as { version: string }).version).toBe('1.1.4')
  expect(packageJson.version).toBe('1.1.4')
})
