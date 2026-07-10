import type { ProfileCredentials } from './command-implementations/global-command'
import type { BotLink } from './cloud-project-link'
import * as consts from './consts'
import * as errors from './errors'

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

export type StackAuthority = {
  apiUrl?: unknown
  workspaceId?: unknown
}

export function assertProfileAuthority(
  source: string,
  target: StackAuthority,
  profile: Pick<ProfileCredentials, 'apiUrl' | 'workspaceId'>,
  options: { requireCoordinates?: boolean } = {}
): void {
  const profileApiUrl = profile.apiUrl.replace(/\/+$/, '')
  const targetApiUrl =
    typeof target.apiUrl === 'string' && target.apiUrl.length > 0
      ? target.apiUrl.replace(/\/+$/, '')
      : undefined
  const targetWorkspaceId =
    typeof target.workspaceId === 'string' || typeof target.workspaceId === 'number'
      ? String(target.workspaceId)
      : undefined

  if (options.requireCoordinates && targetApiUrl === undefined) {
    throw new errors.BotpressCLIError(`${source} has no apiUrl`)
  }
  if (options.requireCoordinates && targetWorkspaceId === undefined) {
    throw new errors.BotpressCLIError(`${source} has no workspaceId`)
  }
  if (target.apiUrl !== undefined && targetApiUrl === undefined) {
    throw new errors.BotpressCLIError(`${source} apiUrl must be a non-empty string`)
  }
  if (target.workspaceId !== undefined && targetWorkspaceId === undefined) {
    throw new errors.BotpressCLIError(`${source} workspaceId must be a string or number`)
  }
  if (targetApiUrl !== undefined && targetApiUrl !== profileApiUrl) {
    throw new errors.BotpressCLIError(
      `${source} apiUrl=${targetApiUrl} does not match selected profile apiUrl=${profileApiUrl}`
    )
  }
  if (targetWorkspaceId !== undefined && targetWorkspaceId !== profile.workspaceId) {
    throw new errors.BotpressCLIError(
      `${source} workspaceId=${targetWorkspaceId} does not match selected profile workspaceId=${profile.workspaceId}`
    )
  }
}
