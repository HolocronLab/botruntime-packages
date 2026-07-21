import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

import { PACKAGE_ORDER } from './package-order.mjs'

const root = new URL('../', import.meta.url)
const packagesDir = new URL('../packages/', import.meta.url)

const publicPackages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => new URL(`../packages/${entry.name}/package.json`, import.meta.url))
  .filter(existsSync)
  .map((manifestUrl) => ({ manifestUrl, manifest: JSON.parse(readFileSync(manifestUrl, 'utf8')) }))
  .filter(({ manifest }) => manifest.name?.startsWith('@holocronlab/') && manifest.private !== true)

const integrationDirectories = readdirSync(new URL('../integrations/', import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

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

for (const integrationName of integrationDirectories) {
  test(`${integrationName} installs public Holocron dependencies without GitHub auth`, () => {
    const lockfileUrl = new URL(`../integrations/${integrationName}/bun.lock`, import.meta.url)
    assert.equal(existsSync(lockfileUrl), true)
    assert.doesNotMatch(readFileSync(lockfileUrl, 'utf8'), /npm\.pkg\.github\.com/)
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

test('docs contract CI retains unreleased ZUI and JEX throughout a release PR', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  const zuiBuild = workflow.indexOf('name: Build the current botruntime-zui package')
  const jexBuild = workflow.indexOf('name: Build the current botruntime-jex package')
  const sdkBuild = workflow.indexOf('name: Build the current botruntime-sdk package')

  assert.ok(zuiBuild >= 0 && jexBuild > zuiBuild && sdkBuild > jexBuild)

  const expectedLocalDependencies = new Map([
    ['botruntime-sdk', ['botruntime-zui']],
    ['botruntime-zai', ['botruntime-zui']],
    ['botruntime-llmz', ['botruntime-zui']],
    ['botruntime-runtime', ['botruntime-zui']],
    ['botruntime-adk', ['botruntime-zui', 'botruntime-jex']],
    ['brt', ['botruntime-zui']],
  ])

  for (const [packageName, dependencies] of expectedLocalDependencies) {
    const prepareLine = workflow
      .split('\n')
      .find((line) => line.includes(`--package=packages/${packageName}`))
    assert.ok(prepareLine, `docs-contract must prepare ${packageName}`)
    for (const dependency of dependencies) {
      assert.match(
        prepareLine,
        new RegExp(`--exclude=@holocronlab/${dependency}(?:\\s|$)`),
        `${packageName} must keep the checkout ${dependency} package local`
      )
    }
  }
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

  const chatBuild = workflow.indexOf('name: Install the current botruntime-chat package')
  const evalsBuild = workflow.indexOf('name: Build the current botruntime-evals package')
  const runtimeBuild = workflow.indexOf('name: Build the current botruntime-runtime package')
  const analyticsBuild = workflow.indexOf('name: Build the current botruntime-analytics package')
  const adkBuild = workflow.indexOf('name: Build the current botruntime-adk package')
  const brtInstall = workflow.indexOf('name: Install brt contract-generator dependencies')

  assert.ok(chatBuild >= 0 && evalsBuild > chatBuild && runtimeBuild > evalsBuild && adkBuild > runtimeBuild && brtInstall > adkBuild)
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
  assert.doesNotMatch(localReleaseBuilds, /bunfig\.github-packages\.toml|npm\.pkg\.github\.com/)
  assert.match(
    workflow,
    /--package=packages\/botruntime-adk[^\n]*--exclude=@holocronlab\/botruntime-chat[^\n]*--exclude=@holocronlab\/botruntime-client[^\n]*--exclude=@holocronlab\/botruntime-runtime[^\n]*--exclude=@holocronlab\/botruntime-sdk/
  )
  assert.match(
    workflow,
    /--package=packages\/brt[^\n]*--exclude=@holocronlab\/botruntime-adk[^\n]*--exclude=@holocronlab\/botruntime-chat[^\n]*--exclude=@holocronlab\/botruntime-evals[^\n]*--exclude=@holocronlab\/botruntime-client[^\n]*--exclude=@holocronlab\/botruntime-sdk/
  )
})

test('global integration publication installs brt and dependencies anonymously', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/publish-integrations-catalog.yml', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(workflow, /npm\.pkg\.github\.com|GITHUB_TOKEN|NODE_AUTH_TOKEN|read:packages/)
  assert.match(workflow, /npm install --global --userconfig=\/dev\/null @holocronlab\/brt@0\.6\.0/)
  assert.match(workflow, /bun install --frozen-lockfile --ignore-scripts/)
  assert.equal(existsSync(new URL('../.github/bunfig.github-packages.toml', import.meta.url)), false)
})

test('repository CI proves public packages without GitHub Packages credentials', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  assert.doesNotMatch(workflow, /npm\.pkg\.github\.com|bunfig\.github-packages\.toml|GITHUB_TOKEN|read:packages/)
  assert.match(workflow, /actions\/checkout@v6/)
  assert.match(workflow, /actions\/setup-node@v6/)
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v4/)
})

test('repository CI rejects an incomplete immutable release version closure', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  assert.match(workflow, /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/)
  assert.match(workflow, /node scripts\/release-version-closure\.mjs --base="\$BASE_SHA"/)
  assert.match(workflow, /node --test scripts\/release-version-closure\.test\.mjs/)
})

test('repository CI runs changed eval and BRT checks before docs contract verification', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const evalsBuild = workflow.indexOf('name: Build the current botruntime-evals package')
  const runtimeBuild = workflow.indexOf('name: Build the current botruntime-runtime package')
  const brtVerify = workflow.indexOf('name: Verify contract matches the command tree and schemas')

  assert.ok(evalsBuild >= 0 && runtimeBuild > evalsBuild && brtVerify > runtimeBuild)
  const evalsChecks = workflow.slice(evalsBuild, runtimeBuild)
  assert.match(evalsChecks, /bun run check:type\s+          bun run test\s+          bun run build/)

  const brtChecks = workflow.slice(brtVerify)
  assert.match(
    brtChecks,
    /bun run typecheck\s+          bun run test\s+          bun run docs:contract:check\s+          bun run docs:contract:test/
  )
})

test('packages/* build order is a single source of truth (DEVLP-162)', () => {
  // The list previously lived three times: twice in ci.yml (fork-package-catalog
  // and fork-package-tests do not share job env) and once in
  // publish-public-packages.yml. A rename/reorder now only touches
  // scripts/package-order.mjs; every consumer resolves it via `node
  // scripts/package-order.mjs` (bash-loop shape) or imports PACKAGE_ORDER
  // directly (JS consumers like scripts/discover-fork-package-catalog.mjs).
  const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const publishWorkflow = readFileSync(
    new URL('../.github/workflows/publish-public-packages.yml', import.meta.url),
    'utf8'
  )

  for (const workflow of [ciWorkflow, publishWorkflow]) {
    assert.doesNotMatch(
      workflow,
      /PACKAGE_ORDER: >-/,
      'PACKAGE_ORDER must be resolved from scripts/package-order.mjs, not hardcoded inline in the workflow'
    )
  }

  assert.match(ciWorkflow, /node scripts\/discover-fork-package-catalog\.mjs/)
  const packageOrderSteps = [...ciWorkflow.matchAll(/node scripts\/package-order\.mjs/g)]
  assert.equal(packageOrderSteps.length, 1, 'fork-package-tests must resolve PACKAGE_ORDER from the shared script')
  assert.match(publishWorkflow, /node scripts\/package-order\.mjs/)

  for (const { manifest } of publicPackages) {
    const directory = manifest.repository?.directory?.split('/').at(-1)
    assert.ok(directory, `${manifest.name} must declare its repository directory`)
    assert.ok(PACKAGE_ORDER.includes(directory), `${manifest.name} is missing from scripts/package-order.mjs`)
  }
})

test('every packages/* with a test script is present in scripts/package-order.mjs', () => {
  // Mirrors the fail-loud check scripts/discover-fork-package-catalog.mjs runs
  // in CI, as a local `node --test` gate: a newly added test suite must not be
  // silently left off the PR gate (arch audit 2026-07-17).
  const testedPackages = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const manifestUrl = new URL(`../packages/${name}/package.json`, import.meta.url)
      if (!existsSync(manifestUrl)) return false
      const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'))
      return Boolean(manifest.scripts && manifest.scripts.test)
    })

  const missing = testedPackages.filter((name) => !PACKAGE_ORDER.includes(name))
  assert.deepEqual(missing, [], `packages with a test script missing from PACKAGE_ORDER: ${missing.join(', ')}`)
})

test('the anonymous-consumer release train publishes every public package through OIDC', () => {
  const workflow = readFileSync(new URL('../.github/workflows/publish-public-packages.yml', import.meta.url), 'utf8')
  assert.match(workflow, /id-token: write/)
  assert.match(workflow, /actions\/checkout@v6/)
  assert.match(workflow, /actions\/setup-node@v6/)
  assert.match(workflow, /node-version: ["']24["']/)
  assert.match(workflow, /package-manager-cache: false/)
  assert.match(workflow, /npm install --global npm@11\.15\.0/)
  assert.match(workflow, /registry-url: ["']https:\/\/registry\.npmjs\.org["']/)
  assert.doesNotMatch(workflow, /npm\.pkg\.github\.com|GITHUB_TOKEN|NODE_AUTH_TOKEN|NPM_TOKEN/)
  assert.match(workflow, /fetch-depth: 0/)
  assert.match(workflow, /gh release list --limit 100 --json tagName,publishedAt,isDraft/)
  assert.match(workflow, /startswith\("brt-v"\)/)
  assert.match(workflow, /git cat-file -e "\$\{base_ref\}\^\{commit\}"/)
  assert.match(
    workflow,
    /node scripts\/release-version-closure\.mjs --base="\$\{\{ steps\.release-base\.outputs\.ref \}\}"/
  )
  assert.match(workflow, /- ["']adk-v\*["']/)
  assert.match(workflow, /- ["']brt-v\*["']/)

  // DEVLP-162: PACKAGE_ORDER itself is no longer inlined here — it is resolved
  // from the single-source scripts/package-order.mjs (see the dedicated test
  // below) and threaded in through a step output.
  assert.match(workflow, /node scripts\/package-order\.mjs/)
  assert.match(workflow, /PACKAGE_ORDER: \$\{\{ steps\.package-order\.outputs\.list \}\}/)
  assert.doesNotMatch(workflow, /PACKAGE_ORDER: >-/)

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
  assert.match(publishPhase, /consumer_dir="\$\(mktemp -d\)"/)
  assert.match(publishPhase, /npm install \\\n[\s\S]*--prefix "\$consumer_dir"[\s\S]*"@holocronlab\/brt@\$brt_version"/)
  assert.match(
    publishPhase,
    /node scripts\/verify-installed-release-train\.mjs --consumer="\$consumer_dir"/
  )
})

test('brt tarball publication is serialized after the complete public package train', () => {
  const catalogWorkflow = readFileSync(
    new URL('../.github/workflows/publish-public-packages.yml', import.meta.url),
    'utf8'
  )
  const brtWorkflow = readFileSync(new URL('../.github/workflows/publish-brt.yml', import.meta.url), 'utf8')

  assert.match(
    catalogWorkflow,
    /pack-brt:\s+needs: publish[\s\S]*?uses: \.\/\.github\/workflows\/publish-brt\.yml/
  )
  assert.match(catalogWorkflow, /release-sha: \$\{\{ steps\.release-ref\.outputs\.sha \}\}/)
  assert.match(catalogWorkflow, /ref: \$\{\{ needs\.publish\.outputs\.release-sha \}\}/)
  assert.match(catalogWorkflow, /tag: \$\{\{ github\.ref_name \}\}/)
  assert.match(brtWorkflow, /workflow_call:/)
  assert.doesNotMatch(brtWorkflow, /push:\s+tags:/)
  assert.match(brtWorkflow, /actions\/checkout@v6/)
  assert.match(brtWorkflow, /ref: \$\{\{ inputs\.ref \|\| github\.ref \}\}/)
  assert.match(brtWorkflow, /TAG="\$\{\{ inputs\.tag \}\}"/)
  assert.doesNotMatch(brtWorkflow, /TAG="\$\{\{[^\n]*(?:inputs\.ref|github\.ref_name)/)
})
