import { spawnSync } from 'node:child_process'
import semver from 'semver'
import { expect, it } from 'vitest'
import packageJson from '../package.json'
import { CLI_VERSION, CLI_VERSION_CHANGELOG_URL, CLI_VERSION_EPILOGUE } from './cli-version'

it('uses the shipped package version instead of yargs package discovery', () => {
  expect(CLI_VERSION).toBe(packageJson.version)
  expect(CLI_VERSION).not.toBe('unknown')
})

it('CLI_VERSION is a plain semver version, not a decorated banner', () => {
  expect(semver.valid(CLI_VERSION)).toBe(CLI_VERSION)
})

it('epilogue links to this package changelog location (DEVLP-174)', () => {
  expect(CLI_VERSION_CHANGELOG_URL).toMatch(/^https:\/\/github\.com\/HolocronLab\/botruntime-packages\/tree\/main\/packages\/brt$/)
  // Помещается в 80-колоночный wrap yargs своей строкой: разорванный переносом
  // URL некликабелен и некопируем.
  expect(CLI_VERSION_CHANGELOG_URL.length).toBeLessThanOrEqual(80)
  expect(CLI_VERSION_EPILOGUE).toContain(CLI_VERSION_CHANGELOG_URL)
})

// End-to-end: `brt --version` output is consumed by scripts (adk-bundle's semver
// compatibility check reads CLI_VERSION directly, but external tooling may parse
// the CLI's actual stdout) and must stay a bare, machine-readable semver string —
// the changelog pointer must not leak into it. It belongs in --help instead.
it('`brt --version` prints a bare semver on stdout, with no changelog banner', () => {
  const result = spawnSync('bun', ['run', 'src/cli.ts', '--version'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  })

  expect(result.status).toBe(0)
  const stdout = result.stdout.trim()
  expect(semver.valid(stdout)).toBe(stdout)
  expect(stdout).toBe(CLI_VERSION)
})

it('`brt --help` epilogue contains the CHANGELOG link', () => {
  const result = spawnSync('bun', ['run', 'src/cli.ts', '--help'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  })

  expect(result.status).toBe(0)
  // Ссылка обязана быть НЕразорванной: разбитый 80-колоночным wrap'ом yargs URL
  // некликабелен и некопируем — тест ловит контент ровно одной строкой, без
  // маскировки склейкой переносов.
  const lines = result.stdout.split('\n')
  expect(lines.some((line) => line.trim() === CLI_VERSION_CHANGELOG_URL)).toBe(true)
})
