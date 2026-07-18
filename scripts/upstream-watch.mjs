#!/usr/bin/env node
// DEVLP-159: our forks vendor Botpress/@bpinternal SOURCE (see README.md, "The runtime
// libraries") instead of depending on the real @botpress/* packages, which is exactly why
// Renovate/Dependabot cannot help here — there is no package.json range on the upstream
// package for a bot to bump. scripts/upstream-pins.json is the only record of "which
// upstream version each fork was cut from"; this script diffs it against the live npm
// registry so a stale fork surfaces on a schedule instead of only when something breaks in
// prod (precedent: the lost source-map-js patch on botruntime-llmz, DEVLP-159).
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Minimal semver compare: numeric release core, then treat a shorter/prerelease-tagged
// version as older than a plain release with the same core (good enough to detect "there is
// a newer real release", not a full semver-range resolver).
export function compareSemver(a, b) {
  const parse = (version) => {
    const [core, ...prereleaseParts] = String(version).split('-')
    const release = core.split('.').map((part) => {
      const n = Number(part)
      if (!Number.isInteger(n) || n < 0) throw new Error(`not a plain semver version: ${version}`)
      return n
    })
    return { release, prerelease: prereleaseParts.join('-') }
  }

  const left = parse(a)
  const right = parse(b)
  const len = Math.max(left.release.length, right.release.length)
  for (let i = 0; i < len; i++) {
    const diff = (left.release[i] ?? 0) - (right.release[i] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  if (left.prerelease === right.prerelease) return 0
  if (left.prerelease === '') return 1
  if (right.prerelease === '') return -1
  return left.prerelease < right.prerelease ? -1 : 1
}

// entry: one record from upstream-pins.json#forks. latest: string (npm dist-tag "latest"),
// or null when the upstream package is confirmed gone from the registry (404, not a
// transient error — callers must not pass a transient failure here, see fetchLatestVersion).
export function evaluatePin(entry, latest) {
  if (latest === null) return { status: 'unpublished' }
  if (entry.pinned === null) return { status: 'unknown-pin', latest }
  const cmp = compareSemver(entry.pinned, latest)
  if (cmp === 0) return { status: 'up-to-date', latest }
  if (cmp < 0) return { status: 'drift', latest }
  return { status: 'ahead', latest } // pin newer than registry "latest" tag (e.g. a prerelease pin) — surface, don't hide
}

// Returns the npm "latest" version string, or null if the registry confirms the package is
// gone (404). Any other failure (timeout, 5xx, DNS, auth) is rethrown — a real fetch failure
// must fail the run loudly, not be folded into "no drift found".
export async function fetchLatestVersion(packageName, { registry = 'https://registry.npmjs.org', exec = execFileAsync } = {}) {
  try {
    const { stdout } = await exec('npm', [
      'view',
      packageName,
      'version',
      '--userconfig=/dev/null',
      `--registry=${registry}`,
    ])
    const version = stdout.trim()
    if (!version) throw new Error(`npm view ${packageName} returned an empty version`)
    return version
  } catch (error) {
    if (typeof error?.stderr === 'string' && /\bE404\b/.test(error.stderr)) return null
    throw error
  }
}

export async function buildReport(pinsFile, { fetch = fetchLatestVersion } = {}) {
  const rows = []
  for (const entry of pinsFile.forks) {
    if (!entry.upstream) {
      rows.push({ entry, status: 'no-upstream' })
      continue
    }
    const latest = await fetch(entry.upstream)
    rows.push({ entry, ...evaluatePin(entry, latest) })
  }

  const hasDrift = rows.some((row) => row.status === 'drift')
  return { rows, hasDrift }
}

function statusLabel(status) {
  switch (status) {
    case 'drift':
      return '⚠️ DRIFT'
    case 'up-to-date':
      return 'up to date'
    case 'ahead':
      return 'pin ahead of latest'
    case 'unknown-pin':
      return 'no recorded pin'
    case 'unpublished':
      return 'upstream unavailable (404)'
    default:
      return status
  }
}

export function renderMarkdown(report, { generatedAt = new Date().toISOString() } = {}) {
  const lines = [
    '# Upstream drift watch (DEVLP-159)',
    '',
    `Generated ${generatedAt}. Compares \`scripts/upstream-pins.json\` against the npm ` +
      '"latest" dist-tag for each tracked fork. Renovate/Dependabot do not apply here — see ' +
      'the header comment in `.github/workflows/upstream-watch.yml`.',
    '',
    '| Fork | Upstream | Pinned | Latest | Status |',
    '|---|---|---|---|---|',
  ]
  for (const row of report.rows) {
    const { entry } = row
    lines.push(
      `| \`${entry.package}\` | ${entry.upstream ?? '—'} | ${entry.pinned ?? '—'} | ${row.latest ?? '—'} | ${statusLabel(row.status)} |`
    )
  }

  const drifted = report.rows.filter((row) => row.status === 'drift')
  if (drifted.length > 0) {
    lines.push('', '## Action needed', '')
    for (const row of drifted) {
      lines.push(`- **${row.entry.package}**: pinned \`${row.entry.pinned}\` → upstream now \`${row.latest}\` (${row.entry.upstream}).`)
    }
  } else {
    lines.push('', 'No pinned fork is behind its upstream "latest" this run.')
  }

  const withoutPin = report.rows.filter((row) => row.status === 'unknown-pin')
  if (withoutPin.length > 0) {
    lines.push('', '## Recorded as unknown pin (see note in upstream-pins.json)', '')
    for (const row of withoutPin) {
      lines.push(`- **${row.entry.package}** (${row.entry.upstream}): latest is \`${row.latest}\`. ${row.entry.note ?? ''}`)
    }
  }

  const unavailable = report.rows.filter((row) => row.status === 'unpublished')
  if (unavailable.length > 0) {
    lines.push('', '## Upstream package unavailable on npm', '')
    for (const row of unavailable) {
      lines.push(`- **${row.entry.package}** (${row.entry.upstream}, pinned \`${row.entry.pinned ?? '—'}\`): ${row.entry.note ?? 'no longer resolves on the public registry.'}`)
    }
  }

  return lines.join('\n') + '\n'
}

async function main() {
  const pinsPathArg = process.argv.find((arg) => arg.startsWith('--pins='))?.slice('--pins='.length)
  const outJsonArg = process.argv.find((arg) => arg.startsWith('--out-json='))?.slice('--out-json='.length)
  const outMdArg = process.argv.find((arg) => arg.startsWith('--out-md='))?.slice('--out-md='.length)

  const pinsPath = pinsPathArg ? resolve(pinsPathArg) : resolve(root, 'scripts/upstream-pins.json')
  const pinsFile = JSON.parse(await readFile(pinsPath, 'utf8'))

  const report = await buildReport(pinsFile)
  const markdown = renderMarkdown(report)

  process.stdout.write(markdown)

  if (outJsonArg) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(resolve(outJsonArg), JSON.stringify(report, null, 2) + '\n', 'utf8')
  }
  if (outMdArg) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(resolve(outMdArg), markdown, 'utf8')
  }

  if (report.hasDrift) {
    process.stderr.write(`\n${report.rows.filter((row) => row.status === 'drift').length} fork(s) behind upstream — see report above.\n`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    process.exitCode = 1
  })
}
