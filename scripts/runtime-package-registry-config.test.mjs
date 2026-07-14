import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const expectedScope =
  '[install.scopes]\n"@holocronlab" = { token = "$GITHUB_TOKEN", url = "https://npm.pkg.github.com/" }\n'

for (const packageName of ['botruntime-sdk', 'botruntime-evals', 'botruntime-runtime', 'botruntime-adk']) {
  test(`${packageName} resolves private dependencies from GitHub Packages`, () => {
    const config = readFileSync(
      new URL(`../packages/${packageName}/bunfig.toml`, import.meta.url),
      'utf8'
    )

    assert.equal(config, expectedScope)
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

test('global integration publication authenticates Bun against GitHub Packages', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/publish-integrations-catalog.yml', import.meta.url),
    'utf8'
  )
  const config = readFileSync(
    new URL('../.github/bunfig.github-packages.toml', import.meta.url),
    'utf8'
  )

  assert.equal(config, expectedScope)
  assert.match(
    workflow,
    /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/,
    'Bun expands $GITHUB_TOKEN from the step environment'
  )
  assert.match(
    workflow,
    /bun install --config="\$GITHUB_WORKSPACE\/\.github\/bunfig\.github-packages\.toml" --frozen-lockfile --ignore-scripts/,
    'every integration install must pass the authenticated config as a Bun install option'
  )
})
