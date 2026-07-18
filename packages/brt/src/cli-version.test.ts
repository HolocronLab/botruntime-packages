import { expect, it } from 'vitest'
import packageJson from '../package.json'
import { CLI_VERSION, CLI_VERSION_BANNER, CLI_VERSION_CHANGELOG_URL } from './cli-version'

it('uses the shipped package version instead of yargs package discovery', () => {
  expect(CLI_VERSION).toBe(packageJson.version)
  expect(CLI_VERSION).not.toBe('unknown')
})

it('--version banner leads with the bare semver so version-parsing callers keep working', () => {
  expect(CLI_VERSION_BANNER.startsWith(CLI_VERSION)).toBe(true)
})

it('--version banner links to this package CHANGELOG (DEVLP-174)', () => {
  expect(CLI_VERSION_CHANGELOG_URL).toMatch(/^https:\/\/github\.com\/HolocronLab\/botruntime-packages\/blob\/main\/packages\/brt\/CHANGELOG\.md$/)
  expect(CLI_VERSION_BANNER).toContain(CLI_VERSION_CHANGELOG_URL)
})
