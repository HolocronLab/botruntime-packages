import packageJson from '../package.json'

export const CLI_VERSION = packageJson.version

// Kept separate from CLI_VERSION: adk-bundle.ts feeds CLI_VERSION straight into a
// semver compatibility check, so it must stay a bare version string. This is only
// for the `--version` flag's human-readable output (DEVLP-174 — "what changed?").
export const CLI_VERSION_CHANGELOG_URL =
  'https://github.com/HolocronLab/botruntime-packages/blob/main/packages/brt/CHANGELOG.md'
export const CLI_VERSION_BANNER = `${CLI_VERSION}\nChangelog: ${CLI_VERSION_CHANGELOG_URL}`
