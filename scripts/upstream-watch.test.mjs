import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReport, compareSemver, evaluatePin, fetchLatestVersion, renderMarkdown } from './upstream-watch.mjs'

test('compareSemver orders numerically, not lexicographically', () => {
  assert.equal(compareSemver('1.9.0', '1.10.0'), -1)
  assert.equal(compareSemver('2.0.0', '2.0.0'), 0)
  assert.equal(compareSemver('2.1.0', '2.0.9'), 1)
})

test('compareSemver treats a prerelease as older than the same release core', () => {
  assert.equal(compareSemver('0.1.0-beta.1', '0.1.0'), -1)
  assert.equal(compareSemver('0.1.0', '0.1.0-beta.1'), 1)
})

test('compareSemver rejects non-numeric version parts instead of guessing', () => {
  assert.throws(() => compareSemver('latest', '1.0.0'), /not a plain semver version/)
})

test('evaluatePin reports drift when latest is newer than the pin', () => {
  const entry = { package: 'botruntime-client', upstream: '@botpress/client', pinned: '1.46.0' }
  assert.deepEqual(evaluatePin(entry, '1.48.0'), { status: 'drift', latest: '1.48.0' })
})

test('evaluatePin reports up-to-date when latest matches the pin exactly', () => {
  const entry = { package: 'botruntime-zui', upstream: '@bpinternal/zui', pinned: '2.3.0' }
  assert.deepEqual(evaluatePin(entry, '2.3.0'), { status: 'up-to-date', latest: '2.3.0' })
})

test('evaluatePin reports unpublished without comparing versions when the registry has nothing', () => {
  const entry = { package: 'botruntime-analytics', upstream: '@botpress/analytics', pinned: null }
  assert.deepEqual(evaluatePin(entry, null), { status: 'unpublished' })
})

test('evaluatePin reports unknown-pin when we have a live latest but no recorded baseline', () => {
  const entry = { package: 'brt', upstream: '@botpress/cli', pinned: null }
  assert.deepEqual(evaluatePin(entry, '6.8.9'), { status: 'unknown-pin', latest: '6.8.9' })
})

test('evaluatePin surfaces a pin ahead of the registry latest instead of silently treating it as fine', () => {
  const entry = { package: 'weird', upstream: '@botpress/weird', pinned: '2.0.0' }
  assert.deepEqual(evaluatePin(entry, '1.9.0'), { status: 'ahead', latest: '1.9.0' })
})

test('fetchLatestVersion returns the trimmed version from the injected exec', async () => {
  const exec = async () => ({ stdout: '1.48.0\n', stderr: '' })
  const version = await fetchLatestVersion('@botpress/client', { exec })
  assert.equal(version, '1.48.0')
})

test('fetchLatestVersion returns null on a confirmed npm E404, not on any nonzero exit', async () => {
  const exec = async () => {
    const error = new Error('npm view failed')
    error.code = 1
    error.stderr = "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@botpress%2fanalytics - Not found\n"
    throw error
  }
  const version = await fetchLatestVersion('@botpress/analytics', { exec })
  assert.equal(version, null)
})

test('fetchLatestVersion rethrows a transient failure instead of masking it as "no drift"', async () => {
  const exec = async () => {
    const error = new Error('getaddrinfo ENOTFOUND registry.npmjs.org')
    error.code = 1
    error.stderr = 'npm error code ENOTFOUND\n'
    throw error
  }
  await assert.rejects(() => fetchLatestVersion('@botpress/client', { exec }), /ENOTFOUND/)
})

test('buildReport aggregates every pins entry using the injected fetcher', async () => {
  const pinsFile = {
    forks: [
      { package: 'botruntime-client', path: 'packages/botruntime-client', upstream: '@botpress/client', pinned: '1.46.0', note: null },
      { package: 'botruntime-zui', path: 'packages/botruntime-zui', upstream: '@bpinternal/zui', pinned: '2.3.0', note: null },
      { package: 'botruntime-analytics', path: 'packages/botruntime-analytics', upstream: '@botpress/analytics', pinned: null, note: 'gone' },
    ],
  }
  const responses = { '@botpress/client': '1.48.0', '@bpinternal/zui': '2.3.0', '@botpress/analytics': null }
  const report = await buildReport(pinsFile, { fetch: async (name) => responses[name] })

  assert.equal(report.hasDrift, true)
  assert.deepEqual(
    report.rows.map((row) => [row.entry.package, row.status]),
    [
      ['botruntime-client', 'drift'],
      ['botruntime-zui', 'up-to-date'],
      ['botruntime-analytics', 'unpublished'],
    ]
  )
})

test('buildReport with no drifted entries reports hasDrift=false', async () => {
  const pinsFile = {
    forks: [{ package: 'botruntime-zui', path: 'packages/botruntime-zui', upstream: '@bpinternal/zui', pinned: '2.3.0', note: null }],
  }
  const report = await buildReport(pinsFile, { fetch: async () => '2.3.0' })
  assert.equal(report.hasDrift, false)
})

test('renderMarkdown lists a drifted entry under "Action needed"', async () => {
  const pinsFile = {
    forks: [{ package: 'botruntime-client', path: 'packages/botruntime-client', upstream: '@botpress/client', pinned: '1.46.0', note: null }],
  }
  const report = await buildReport(pinsFile, { fetch: async () => '1.48.0' })
  const markdown = renderMarkdown(report, { generatedAt: '2026-07-19T00:00:00.000Z' })

  assert.match(markdown, /## Action needed/)
  assert.match(markdown, /botruntime-client.*pinned `1\.46\.0`.*upstream now `1\.48\.0`/)
})

test('renderMarkdown says nothing is behind when there is no drift', async () => {
  const pinsFile = {
    forks: [{ package: 'botruntime-zui', path: 'packages/botruntime-zui', upstream: '@bpinternal/zui', pinned: '2.3.0', note: null }],
  }
  const report = await buildReport(pinsFile, { fetch: async () => '2.3.0' })
  const markdown = renderMarkdown(report)

  assert.doesNotMatch(markdown, /## Action needed/)
  assert.match(markdown, /No pinned fork is behind/)
})
