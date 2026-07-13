import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const expectedScope =
  '[install.scopes]\n"@holocronlab" = { token = "$GITHUB_TOKEN", url = "https://npm.pkg.github.com/" }\n'

for (const packageName of ['botruntime-evals', 'botruntime-runtime', 'botruntime-adk']) {
  test(`${packageName} resolves private dependencies from GitHub Packages`, () => {
    const config = readFileSync(
      new URL(`../packages/${packageName}/bunfig.toml`, import.meta.url),
      'utf8'
    )

    assert.equal(config, expectedScope)
  })
}
