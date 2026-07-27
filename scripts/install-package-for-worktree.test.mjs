import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test, { after } from 'node:test'

const helperSource = readFileSync(
  new URL('./install-package-for-worktree.sh', import.meta.url),
  'utf8',
)

const fixtureRoots = []
after(() => {
  for (const root of fixtureRoots) {
    rmSync(root, { recursive: true, force: true })
  }
})

const createFixture = ({
  installExit = 0,
  bunVersion = '1.3.14',
  mutateLock = false,
} = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'botruntime-worktree-install-'))
  fixtureRoots.push(root)
  const scripts = join(root, 'scripts')
  const packageDir = join(root, 'packages', 'example')
  const patchesDir = join(root, 'packages', 'botruntime-llmz', 'patches')
  const binDir = join(root, 'bin')

  mkdirSync(scripts, { recursive: true })
  mkdirSync(packageDir, { recursive: true })
  mkdirSync(patchesDir, { recursive: true })
  mkdirSync(binDir, { recursive: true })

  writeFileSync(join(scripts, 'install-package-for-worktree.sh'), helperSource)
  writeFileSync(join(packageDir, 'package.json'), '{"name":"example"}\n')
  writeFileSync(join(packageDir, 'bun.lock'), '{"lockfileVersion":1}\n')
  writeFileSync(
    join(binDir, 'bun'),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\\n' '${bunVersion}'
  exit 0
fi
if [ "$1" = "install" ]; then
  printf '%s\\n' "$*" > .install-args
  ${mutateLock ? "printf '%s\\n' mutated > bun.lock" : ''}
  exit ${installExit}
fi
exit 99
`,
    { mode: 0o755 },
  )

  return { root, packageDir, binDir }
}

const runHelper = ({ root, binDir }) =>
  spawnSync('bash', ['scripts/install-package-for-worktree.sh', 'example'], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
    },
    encoding: 'utf8',
  })

test('uses the immutable worktree install contract and preserves manifests', () => {
  const fixture = createFixture()
  const packageJsonBefore = readFileSync(join(fixture.packageDir, 'package.json'), 'utf8')
  const lockBefore = readFileSync(join(fixture.packageDir, 'bun.lock'), 'utf8')

  const result = runHelper(fixture)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    readFileSync(join(fixture.packageDir, '.install-args'), 'utf8'),
    'install --no-save --ignore-scripts\n',
  )
  assert.equal(readFileSync(join(fixture.packageDir, 'package.json'), 'utf8'), packageJsonBefore)
  assert.equal(readFileSync(join(fixture.packageDir, 'bun.lock'), 'utf8'), lockBefore)
  assert.equal(existsSync(join(fixture.packageDir, 'patches')), false)
})

test('cleans its temporary patch link when Bun fails', () => {
  const fixture = createFixture({ installExit: 7 })

  const result = runHelper(fixture)

  assert.equal(result.status, 7)
  assert.equal(existsSync(join(fixture.packageDir, 'patches')), false)
})

test('never removes a package-owned patches path', () => {
  const fixture = createFixture()
  const ownedPatches = join(fixture.packageDir, 'patches')
  mkdirSync(ownedPatches)
  writeFileSync(join(ownedPatches, 'owned.patch'), 'owned\n')

  const result = runHelper(fixture)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(join(ownedPatches, 'owned.patch'), 'utf8'), 'owned\n')
})

test('fails before install when the Bun version differs from CI', () => {
  const fixture = createFixture({ bunVersion: '1.3.13' })

  const result = runHelper(fixture)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /requires Bun 1\.3\.14/)
  assert.equal(existsSync(join(fixture.packageDir, '.install-args')), false)
})

test('fails closed if Bun changes the lockfile', () => {
  const fixture = createFixture({ mutateLock: true })

  const result = runHelper(fixture)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /changed package\.json or bun\.lock/)
  assert.equal(existsSync(join(fixture.packageDir, 'patches')), false)
})

test('rejects paths instead of escaping packages directory', () => {
  const fixture = createFixture()

  const result = spawnSync(
    'bash',
    ['scripts/install-package-for-worktree.sh', '../example'],
    {
      cwd: fixture.root,
      env: {
        ...process.env,
        PATH: `${fixture.binDir}:${process.env.PATH ?? ''}`,
      },
      encoding: 'utf8',
    },
  )

  assert.equal(result.status, 64)
  assert.match(result.stderr, /package name/)
})
