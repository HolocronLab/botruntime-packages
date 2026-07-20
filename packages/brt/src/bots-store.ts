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
//
// CONCURRENCY: each write replaces the WHOLE store, and callers do read-mutate-write
// (readBotsStore -> set -> writeBotsStore). Two brt commands mutating bots.json at the
// same instant would last-writer-wins and could drop the other's just-minted key. This
// matches the thin CLI and is acceptable because brt is a single-user, sequentially-run
// dev CLI — it is NOT safe for concurrent invocations. If that ever changes, guard the
// read-mutate-write with a file lock rather than widening this function.
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
