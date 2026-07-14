import semver from 'semver'
import * as errors from './errors'

export function assertAdkCompatibility(cliVersion: string, compatibilityRange: unknown): void {
  if (typeof compatibilityRange !== 'string' || !semver.validRange(compatibilityRange)) {
    throw new errors.BotpressCLIError(
      'Installed @holocronlab/botruntime-adk has no valid BRT compatibility metadata. Update brt and botruntime-adk together.'
    )
  }
  if (!semver.satisfies(cliVersion, compatibilityRange)) {
    throw new errors.BotpressCLIError(
      `Installed botruntime-adk requires brt ${compatibilityRange}, but this CLI is ${cliVersion}. Update brt before continuing.`
    )
  }
}
