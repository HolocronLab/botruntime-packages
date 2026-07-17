import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('root oxfmt configuration fails closed', async () => {
  const config = JSON.parse(await readFile(path.join(repositoryRoot, '.oxfmtrc.json'), 'utf8'))
  assert.deepEqual(config.ignorePatterns, ['**/*'])
})

test('package scripts cannot invoke oxfmt across the repository', async () => {
  const packagesRoot = path.join(repositoryRoot, 'packages')
  const packageNames = await readdir(packagesRoot)

  for (const packageName of packageNames) {
    const packageJsonPath = path.join(packagesRoot, packageName, 'package.json')
    let packageJson
    try {
      packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }

    for (const [scriptName, command] of Object.entries(packageJson.scripts ?? {})) {
      if (!/\boxfmt\b/.test(command)) continue
      assert.doesNotMatch(
        command,
        /(?:^|\s)(?:\.|packages|integrations|scripts)(?:\s|$)/,
        `${packageJson.name ?? packageName} script ${scriptName} runs oxfmt over a broad repository path`
      )
    }
  }
})
