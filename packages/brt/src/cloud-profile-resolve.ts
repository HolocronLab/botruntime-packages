import type { ProfileCredentials } from './command-implementations/global-command'
import type { BotLink } from './cloud-project-link'
import * as consts from './consts'

// Shared profile/apiUrl resolution for the bespoke-cloudapi-wire commands
// (`brt link`, `brt config`, `brt secret`, `brt deploy --adk`,
// `brt integrations install|register|publish`). Factored out of
// command-implementations/cloud-command.ts so that DeployCommand (a
// ProjectCommand, not a CloudCommand) and the machine-scope integration
// publish command can share the exact same resolution order without
// duplicating it command-by-command.

export interface ProfileResolveDeps {
  argvProfile?: string
  getActiveProfile: () => Promise<string | undefined>
  readProfile: (name: string) => Promise<ProfileCredentials>
}

// Profile fallback: --profile wins, else the machine's pinned active profile,
// else "default" (mirrors ActiveProfileCommand).
export async function resolveProfileName(deps: Pick<ProfileResolveDeps, 'argvProfile' | 'getActiveProfile'>): Promise<string> {
  if (deps.argvProfile) return deps.argvProfile
  const active = await deps.getActiveProfile()
  return active ?? consts.defaultProfileName
}

export async function resolveProfile(deps: ProfileResolveDeps): Promise<{ name: string; profile: ProfileCredentials }> {
  const name = await resolveProfileName(deps)
  const profile = await deps.readProfile(name)
  return { name, profile }
}

// Resolution order for the target cloudapi base URL (highest wins): --api-url
// flag (or BRT_API_URL env, already folded into argv by the yargs layer) >
// BP_API_URL env (kept for parity with the Botpress CLI) > the project's
// bot.json/bot.local.json link > profile > default.
export function resolveApiUrl(argvApiUrl: string | undefined, profile: ProfileCredentials, link?: BotLink): string {
  const url = argvApiUrl || process.env['BP_API_URL'] || link?.apiUrl || profile.apiUrl || consts.defaultBotpressApiUrl
  return url.replace(/\/+$/, '')
}
