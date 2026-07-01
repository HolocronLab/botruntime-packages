import * as fs from 'fs'
import * as path from 'path'
import * as errors from './errors'

// bots.json — per-bot API keys minted by the bespoke cloudapi wire (provision-bot /
// link), stored alongside profiles.json in $BRT_BOTPRESS_HOME. This is the fork's
// adaptation of the (deleted) thin brt CLI's `~/.brtrc` `bots[profile][botId]` map:
// same namespacing (per-profile, so the same botId under two profiles never picks
// the wrong key), but as its own file rather than folded into profiles.json — the
// profile file is zod-validated against a fixed { apiUrl, workspaceId, token }
// shape (see global-command.ts) and would silently strip an unknown `bots` key on
// every read, which is exactly the kind of silent-loss bug this file avoids.
//
// Perms are 0600 (same posture as thin's ~/.brtrc): these are live bot credentials.

export interface BotCreds {
  apiKey: string
  // webhookSecret is shown once by POST /v1/admin/integrations/install and
  // stored here (never in bot.json — see cloud-project-link.ts) so a later
  // `brt integrations register` on the same machine does not need to prompt
  // for it again. Optional: absent until the bot has an integration installed.
  webhookSecret?: string
}

// profile -> botId -> creds
export type BotsStore = Record<string, Record<string, BotCreds>>

export function readBotsStore(filePath: string): BotsStore {
  if (!fs.existsSync(filePath)) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `${filePath} is not valid JSON`)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new errors.BotpressCLIError(`${filePath} must contain a JSON object`)
  }
  return parsed as BotsStore
}

// Atomic write: temp file + rename, then 0600 — a crash mid-write never strands a
// minted key in a half-written file (mirrors thin rc.ts saveRc).
export function writeBotsStore(filePath: string, store: BotsStore): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`)
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 })
  fs.renameSync(tmpPath, filePath)
  fs.chmodSync(filePath, 0o600)
}

export function getBotCreds(store: BotsStore, profile: string, botId: string): BotCreds | undefined {
  return store[profile]?.[botId]
}

export function setBotCreds(store: BotsStore, profile: string, botId: string, creds: BotCreds): void {
  ;(store[profile] ??= {})[botId] = { ...store[profile]?.[botId], ...creds }
}

export function removeProfileBotCreds(store: BotsStore, profile: string): void {
  delete store[profile]
}
