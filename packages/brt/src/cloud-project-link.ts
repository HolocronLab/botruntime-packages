import * as fs from 'fs'
import * as path from 'path'
import * as errors from './errors'

// bot.json (committed) / bot.local.json (gitignored) — the prod/dev link between a
// project directory and a bot provisioned on the bespoke cloudapi wire. Ported
// verbatim (filename + shape) from the (deleted) thin brt CLI's project.ts so a bot
// linked/deployed by that CLI keeps resolving under the fork's `brt link` / cloud
// deploy commands. Only public identifiers + webhookId live here; never tokens or
// webhookSecret.

export interface IntegrationLink {
  ref: string // name@version
  alias: string
  webhookId: string
}

export interface BotLink {
  workspaceId?: number
  botId?: number
  apiUrl?: string
  integrations?: IntegrationLink[]
}

export type LinkEnv = 'prod' | 'local'

export function linkFileName(env: LinkEnv): string {
  return env === 'local' ? 'bot.local.json' : 'bot.json'
}

export function linkFilePath(dir: string, env: LinkEnv): string {
  return path.join(dir, linkFileName(env))
}

export function loadLinkIfPresent(dir: string, env: LinkEnv): BotLink | undefined {
  const filePath = linkFilePath(dir, env)
  if (!fs.existsSync(filePath)) return undefined
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BotLink
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `${linkFileName(env)} is not valid JSON`)
  }
}

export function loadLink(dir: string, env: LinkEnv): BotLink {
  const link = loadLinkIfPresent(dir, env)
  if (!link) {
    throw new errors.BotpressCLIError(`${linkFileName(env)} not found in ${dir} — run \`brt link --bot-id <id>\` first`)
  }
  return link
}

export function saveLink(dir: string, env: LinkEnv, link: BotLink): void {
  fs.writeFileSync(linkFilePath(dir, env), JSON.stringify(link, null, 2) + '\n')
}
