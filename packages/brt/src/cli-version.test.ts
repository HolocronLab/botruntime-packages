import { expect, it } from 'vitest'
import packageJson from '../package.json'
import { CLI_VERSION } from './cli-version'

it('uses the shipped package version instead of yargs package discovery', () => {
  expect(CLI_VERSION).toBe(packageJson.version)
  expect(CLI_VERSION).not.toBe('unknown')
})
