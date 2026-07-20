import packageJson from '../package.json'

export const CLI_VERSION = packageJson.version

// Kept separate from CLI_VERSION: adk-bundle.ts feeds CLI_VERSION straight into a
// semver compatibility check, so it must stay a bare version string. `brt --version`
// must also print bare CLI_VERSION on stdout (scripts parse it with semver.valid).
// yargs gives no hook to decorate --version output without breaking that contract,
// so the changelog pointer goes in the --help epilogue instead (DEVLP-174).
// The package-dir tree URL (73 chars) fits yargs' 80-column help wrap on its
// own line; the direct CHANGELOG.md blob URL (86 chars) would be wrapped into
// an uncopyable two-line fragment. CHANGELOG.md is the first visible file there.
export const CLI_VERSION_CHANGELOG_URL =
  'https://github.com/HolocronLab/botruntime-packages/tree/main/packages/brt'
export const CLI_VERSION_EPILOGUE = `Changelog:\n${CLI_VERSION_CHANGELOG_URL}`
