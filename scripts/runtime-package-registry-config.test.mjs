import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const packagesDir = new URL('../packages/', import.meta.url)

const publicPackages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => new URL(`../packages/${entry.name}/package.json`, import.meta.url))
  .filter(existsSync)
  .map((manifestUrl) => ({ manifestUrl, manifest: JSON.parse(readFileSync(manifestUrl, 'utf8')) }))
  .filter(({ manifest }) => manifest.name?.startsWith('@holocronlab/') && manifest.private !== true)

for (const { manifestUrl, manifest } of publicPackages) {
  test(`${manifest.name} publishes publicly to npmjs`, () => {
    assert.deepEqual(manifest.publishConfig, {
      access: 'public',
      registry: 'https://registry.npmjs.org',
    })
    assert.doesNotMatch(readFileSync(manifestUrl, 'utf8'), /npm\.pkg\.github\.com/)
  })
}

for (const packageName of ['botruntime-sdk', 'botruntime-evals', 'botruntime-runtime', 'botruntime-adk', 'brt']) {
  test(`${packageName} does not require an authenticated registry to install dependencies`, () => {
    const configUrl = new URL(`../packages/${packageName}/bunfig.toml`, import.meta.url)
    assert.equal(existsSync(configUrl), true, 'package must override user-level scoped registry configuration')
    const config = readFileSync(configUrl, 'utf8')
    assert.doesNotMatch(config, /npm\.pkg\.github\.com|GITHUB_TOKEN|token\s*=/)
    assert.match(config, /registry\s*=\s*["']https:\/\/registry\.npmjs\.org["']/)
  })
}

for (const workflowName of [
  'publish-runtime-packages.yml',
  'publish-adk-package.yml',
  'publish-brt-package.yml',
]) {
  test(`${workflowName} publishes public packages with an npm token`, () => {
    const workflow = readFileSync(new URL(`../.github/workflows/${workflowName}`, import.meta.url), 'utf8')
    assert.doesNotMatch(workflow, /npm\.pkg\.github\.com/)
    assert.match(workflow, /registry-url: ["']https:\/\/registry\.npmjs\.org["']/)
    assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/)
    assert.match(workflow, /npm publish --access public/)
  })
}

test('docs contract CI retains the checkout SDK until its bumped version is published', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  assert.match(workflow, /name: Build the current botruntime-sdk package/)
  assert.match(
    workflow,
    /--exclude=@holocronlab\/botruntime-sdk/,
    'BRT must not resolve the current checkout SDK from the registry during PR CI'
  )
})

test('global integration publication keeps its separate authenticated catalog registry', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/publish-integrations-catalog.yml', import.meta.url),
    'utf8'
  )
  const config = readFileSync(
    new URL('../.github/bunfig.github-packages.toml', import.meta.url),
    'utf8'
  )

  assert.match(config, /npm\.pkg\.github\.com/)
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/)
})

test('the anonymous-consumer release train publishes every public package', () => {
  const workflow = readFileSync(new URL('../.github/workflows/publish-public-packages.yml', import.meta.url), 'utf8')
  assert.match(workflow, /registry-url: ["']https:\/\/registry\.npmjs\.org["']/)
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/)
  assert.doesNotMatch(workflow, /npm\.pkg\.github\.com|GITHUB_TOKEN/)

  for (const { manifest } of publicPackages) {
    const directory = manifest.repository?.directory?.split('/').at(-1)
    assert.ok(directory, `${manifest.name} must declare its repository directory`)
    assert.match(workflow, new RegExp(`(?:^|\\s)${directory}(?:\\s|$)`), `${manifest.name} is missing from release order`)
  }
})
