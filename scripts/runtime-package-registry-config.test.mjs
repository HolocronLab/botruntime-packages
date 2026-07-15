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

for (const packageName of ['botruntime-adk', 'brt']) {
  test(`${packageName} resolves the current monorepo packages before public release`, () => {
    const packageUrl = new URL(`../packages/${packageName}/package.json`, import.meta.url)
    const manifest = JSON.parse(readFileSync(packageUrl, 'utf8'))
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      if (name.startsWith('@holocronlab/')) {
        assert.match(version, /^file:\.\.\//, `${name} must resolve from the current checkout`)
      }
    }

    const lockfile = readFileSync(new URL(`../packages/${packageName}/bun.lock`, import.meta.url), 'utf8')
    assert.doesNotMatch(lockfile, /npm\.pkg\.github\.com/)
  })
}

for (const workflowName of ['publish-runtime-packages.yml', 'publish-adk-package.yml', 'publish-brt-package.yml']) {
  test(`${workflowName} cannot bypass the canonical trusted publisher`, () => {
    assert.equal(existsSync(new URL(`../.github/workflows/${workflowName}`, import.meta.url)), false)
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

test('docs contract CI retains checkout analytics while building ADK', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  const analyticsBuild = workflow.indexOf('name: Build the current botruntime-analytics package')
  const adkBuild = workflow.indexOf('name: Build the current botruntime-adk package')

  assert.notEqual(analyticsBuild, -1, 'CI must build the checkout analytics package before ADK')
  assert.ok(analyticsBuild < adkBuild, 'checkout analytics must be built before ADK type-checks it')
  assert.match(
    workflow,
    /--package=packages\/botruntime-adk[^\n]*--exclude=@holocronlab\/botruntime-analytics/,
    'ADK must not resolve the current checkout analytics from the registry during PR CI'
  )
})

test('docs contract CI builds every bumped local package before ADK and BRT', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  const evalsBuild = workflow.indexOf('name: Build the current botruntime-evals package')
  const runtimeBuild = workflow.indexOf('name: Build the current botruntime-runtime package')
  const analyticsBuild = workflow.indexOf('name: Build the current botruntime-analytics package')
  const adkBuild = workflow.indexOf('name: Build the current botruntime-adk package')
  const brtInstall = workflow.indexOf('name: Install brt contract-generator dependencies')

  assert.ok(evalsBuild >= 0 && runtimeBuild > evalsBuild && adkBuild > runtimeBuild && brtInstall > adkBuild)
  const localReleaseBuilds = workflow.slice(evalsBuild, analyticsBuild)
  assert.equal((localReleaseBuilds.match(/bun install [^\n]*--no-save --ignore-scripts/g) ?? []).length, 2)
  assert.doesNotMatch(localReleaseBuilds, /bun install --frozen-lockfile/)
  assert.match(
    localReleaseBuilds,
    /--package=packages\/botruntime-evals[^\n]*--exclude=@holocronlab\/botruntime-chat[^\n]*--exclude=@holocronlab\/botruntime-client/
  )
  assert.match(
    localReleaseBuilds,
    /--package=packages\/botruntime-runtime[^\n]*--exclude=@holocronlab\/botruntime-chat[^\n]*--exclude=@holocronlab\/botruntime-client[^\n]*--exclude=@holocronlab\/botruntime-evals[^\n]*--exclude=@holocronlab\/botruntime-sdk/
  )
  assert.equal((localReleaseBuilds.match(/bunfig\.github-packages\.toml/g) ?? []).length, 2)
  assert.match(
    workflow,
    /--package=packages\/botruntime-adk[^\n]*--exclude=@holocronlab\/botruntime-chat[^\n]*--exclude=@holocronlab\/botruntime-client[^\n]*--exclude=@holocronlab\/botruntime-runtime[^\n]*--exclude=@holocronlab\/botruntime-sdk/
  )
  assert.match(
    workflow,
    /--package=packages\/brt[^\n]*--exclude=@holocronlab\/botruntime-adk[^\n]*--exclude=@holocronlab\/botruntime-chat[^\n]*--exclude=@holocronlab\/botruntime-evals[^\n]*--exclude=@holocronlab\/botruntime-client[^\n]*--exclude=@holocronlab\/botruntime-sdk/
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

test('the anonymous-consumer release train publishes every public package with the npm token', () => {
  const workflow = readFileSync(new URL('../.github/workflows/publish-public-packages.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(workflow, /id-token: write/)
  assert.match(workflow, /actions\/checkout@v6/)
  assert.match(workflow, /actions\/setup-node@v6/)
  assert.match(workflow, /node-version: ["']24["']/)
  assert.match(workflow, /package-manager-cache: false/)
  assert.match(workflow, /registry-url: ["']https:\/\/registry\.npmjs\.org["']/)
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/)
  assert.doesNotMatch(workflow, /npm\.pkg\.github\.com|GITHUB_TOKEN/)
  assert.match(workflow, /- ["']adk-v\*["']/)
  assert.match(workflow, /- ["']brt-v\*["']/)

  for (const { manifest } of publicPackages) {
    const directory = manifest.repository?.directory?.split('/').at(-1)
    assert.ok(directory, `${manifest.name} must declare its repository directory`)
    assert.match(workflow, new RegExp(`(?:^|\\s)${directory}(?:\\s|$)`), `${manifest.name} is missing from release order`)
  }

  const packageLoops = [...workflow.matchAll(/for package in \$PACKAGE_ORDER; do/g)]
  assert.equal(packageLoops.length, 2, 'release train must separate verification from manifest rewriting')

  const verifyPhase = workflow.slice(packageLoops[0].index, packageLoops[1].index)
  const publishPhase = workflow.slice(packageLoops[1].index)
  assert.match(verifyPhase, /run_script_if_present "\$package_dir" build/)
  assert.match(verifyPhase, /run_script_if_present "\$package_dir" test/)
  assert.match(workflow, /ln -s \.\.\/botruntime-llmz\/patches "\$patches_path"/)
  assert.match(workflow, /bun install --ignore-scripts --no-save/)
  assert.match(workflow, /unlink "\$patches_path"/)
  assert.doesNotMatch(verifyPhase, /prepare-package-publish/)
  assert.match(publishPhase, /prepare-package-publish/)
  assert.match(publishPhase, /npm publish --access public/)
})
