import packageJson from '../package.json'

export const CLI_VERSION = packageJson.version

// Kept separate from CLI_VERSION: adk-bundle.ts feeds CLI_VERSION straight into a
// semver compatibility check, so it must stay a bare version string. `brt --version`
// must also print bare CLI_VERSION on stdout (scripts parse it with semver.valid).
// yargs gives no hook to decorate --version output without breaking that contract,
// so the changelog pointer goes in the --help epilogue instead (DEVLP-174).
export const CLI_VERSION_CHANGELOG_URL =
  'https://github.com/HolocronLab/botruntime-packages/blob/main/packages/brt/CHANGELOG.md'
export const CLI_VERSION_EPILOGUE = `Changelog: ${CLI_VERSION_CHANGELOG_URL}`
