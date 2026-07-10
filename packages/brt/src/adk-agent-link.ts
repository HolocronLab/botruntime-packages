import * as fs from 'fs'
import * as path from 'path'
import * as errors from './errors'

// agent.json (committed) / agent.local.json (gitignored) — the prod/dev link
// for an ADK "agent" project (agent.config.ts). Mirrors, byte-for-byte, the
// shape and key ordering that @holocronlab/botruntime-adk's AgentProject reads
// and writes (agent-project/agent-project.ts + utils/json-ordering.ts) so a
// project linked/deployed via the ADK library keeps resolving identically
// under brt — WITHOUT brt importing the ADK library at runtime for this. Node
// fs + JSON only; the ADK types/ordering are the spec being mirrored, not a
// runtime dependency.
//
// NOTE the deliberate asymmetry with cloud-project-link.ts's bot.json: THIS
// botId is a STRING (the ADK/cloudapi bot id shape), not a number.

export interface AgentInfo {
  botId: string
  workspaceId: string
  apiUrl?: string
}

export interface AgentLocalInfo {
  botId?: string
  workspaceId?: string
  apiUrl?: string
  devId?: string
  devTargetBotId?: string
  devApiUrl?: string
  devWorkspaceId?: string
}

export interface AgentDevTarget {
  runtimeBotId: string
  targetBotId: string
  apiUrl: string
  workspaceId: string
}

const AGENT_INFO_FILE = 'agent.json'
const AGENT_LOCAL_INFO_FILE = 'agent.local.json'

const AGENT_INFO_KEY_ORDER = ['botId', 'workspaceId', 'apiUrl'] as const
const AGENT_LOCAL_INFO_KEY_ORDER = [
  'botId',
  'workspaceId',
  'apiUrl',
  'devId',
  'devTargetBotId',
  'devApiUrl',
  'devWorkspaceId',
] as const

// Orders known keys first (per keyOrder), then any remaining keys alphabetically.
// Mirrors @holocronlab/botruntime-adk's utils/json-ordering.ts orderKeys().
function orderKeys<T extends Record<string, unknown>>(obj: T, keyOrder: readonly string[]): T {
  const objKeys = Object.keys(obj)
  const ordered = keyOrder.filter((k) => objKeys.includes(k))
  const remaining = objKeys.filter((k) => !ordered.includes(k)).sort()
  const result = {} as T
  for (const key of [...ordered, ...remaining]) {
    result[key as keyof T] = obj[key] as T[keyof T]
  }
  return result
}

// No trailing newline: matches @holocronlab/botruntime-adk's stringifyWithOrder
// + fs.writeFile(content) (no `+ '\n'`), unlike brt's own cloud-project-link.ts.
function stringifyWithOrder<T extends Record<string, unknown>>(obj: T, keyOrder: readonly string[]): string {
  return JSON.stringify(orderKeys(obj, keyOrder), null, 2)
}

export function agentInfoFilePath(dir: string): string {
  return path.join(dir, AGENT_INFO_FILE)
}

export function agentLocalInfoFilePath(dir: string): string {
  return path.join(dir, AGENT_LOCAL_INFO_FILE)
}

// Writes agent.json (the committed, canonical prod link for an agent
// project). Drops an undefined apiUrl rather than writing a literal `null`.
// fs.writeFileSync, no trailing newline — matches writeAgentLocalDevId's
// byte-shape (mirrors @holocronlab/botruntime-adk's own writer).
export function writeAgentInfo(dir: string, info: AgentInfo): void {
  const toWrite: Record<string, unknown> = {
    botId: info.botId,
    workspaceId: info.workspaceId,
  }
  if (info.apiUrl !== undefined) toWrite['apiUrl'] = info.apiUrl
  fs.writeFileSync(agentInfoFilePath(dir), stringifyWithOrder(toWrite, AGENT_INFO_KEY_ORDER))
}

export function readAgentInfoIfPresent(dir: string): AgentInfo | undefined {
  const filePath = agentInfoFilePath(dir)
  if (!fs.existsSync(filePath)) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `${AGENT_INFO_FILE} is not valid JSON`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new errors.BotpressCLIError(`${AGENT_INFO_FILE} must contain an object`)
  }
  const value = parsed as Record<string, unknown>
  for (const field of ['botId', 'workspaceId'] as const) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      throw new errors.BotpressCLIError(`${AGENT_INFO_FILE} ${field} must be a non-empty string`)
    }
  }
  if (value['apiUrl'] !== undefined && (typeof value['apiUrl'] !== 'string' || value['apiUrl'].length === 0)) {
    throw new errors.BotpressCLIError(`${AGENT_INFO_FILE} apiUrl must be a non-empty string when present`)
  }
  return {
    botId: value['botId'] as string,
    workspaceId: value['workspaceId'] as string,
    ...(value['apiUrl'] !== undefined ? { apiUrl: value['apiUrl'] as string } : {}),
  }
}

export function readAgentLocalInfo(dir: string): AgentLocalInfo {
  const filePath = agentLocalInfoFilePath(dir)
  if (!fs.existsSync(filePath)) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `${AGENT_LOCAL_INFO_FILE} is not valid JSON`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new errors.BotpressCLIError(`${AGENT_LOCAL_INFO_FILE} must contain an object`)
  }
  const value = parsed as Record<string, unknown>
  const result: AgentLocalInfo = {}
  for (const field of AGENT_LOCAL_INFO_KEY_ORDER) {
    if (value[field] === undefined) continue
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      throw new errors.BotpressCLIError(`${AGENT_LOCAL_INFO_FILE} ${field} must be a non-empty string`)
    }
    result[field] = value[field] as string
  }
  return result
}

// Convenience accessor for the persisted dev bot id (the ONE value that also
// doubles as the reused dev tunnel's id — see adk-dev-id.ts).
export function getAgentDevId(dir: string): string | undefined {
  return readAgentLocalInfo(dir).devId
}

export function getAgentDevTargetBotId(dir: string): string | undefined {
  return readAgentLocalInfo(dir).devTargetBotId
}

function normalizeApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function resolveAgentDevTargetForStack(
  info: AgentLocalInfo,
  selected: { apiUrl: string; workspaceId: string }
): AgentDevTarget | undefined {
  if (
    !info.devId ||
    !info.devTargetBotId ||
    !/^[1-9][0-9]*$/.test(info.devTargetBotId)
  ) {
    return undefined
  }

  const apiUrl = normalizeApiUrl(selected.apiUrl)
  if (info.devApiUrl !== undefined || info.devWorkspaceId !== undefined) {
    if (!info.devApiUrl || !info.devWorkspaceId) return undefined
    if (normalizeApiUrl(info.devApiUrl) !== apiUrl || info.devWorkspaceId !== selected.workspaceId) {
      return undefined
    }
    return {
      runtimeBotId: info.devId,
      targetBotId: info.devTargetBotId,
      apiUrl,
      workspaceId: selected.workspaceId,
    }
  }
  return undefined
}

export function getLegacyAgentDevRuntimeHint(info: AgentLocalInfo): string | undefined {
  if (!info.devId) return undefined
  if (info.devApiUrl !== undefined || info.devWorkspaceId !== undefined) return undefined
  return info.devId
}

// Applies a partial update to agent.local.json while preserving every field
// not named by the patch. Undefined explicitly clears a field. This is shared
// by `brt link --local` and the dev-target cache so either writer can update
// its own coordinates without losing the other's state.
export function writeAgentLocalInfo(dir: string, patch: Partial<AgentLocalInfo>): void {
  const filePath = agentLocalInfoFilePath(dir)
  const existing = readAgentLocalInfo(dir)
  const merged: AgentLocalInfo = { ...existing, ...patch }
  for (const key of Object.keys(merged) as (keyof AgentLocalInfo)[]) {
    if (merged[key] === undefined) delete merged[key]
  }

  if (Object.keys(merged).length === 0) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return
  }

  fs.writeFileSync(
    filePath,
    stringifyWithOrder(merged as unknown as Record<string, unknown>, AGENT_LOCAL_INFO_KEY_ORDER)
  )
}

// Merges `devId` into agent.local.json, preserving any existing keys
// (botId/workspaceId/apiUrl overrides a developer may have set). Passing
// `undefined` clears the field. If the merged object ends up empty, the file
// is removed entirely — mirrors AgentProject.updateAgentLocalInfo's
// unlink-if-empty behavior, so agent.local.json never lingers as an empty `{}`.
export function writeAgentLocalDevTarget(
  dir: string,
  devId: string | undefined,
  devTargetBotId: string | undefined,
  devApiUrl: string | undefined,
  devWorkspaceId: string | undefined
): void {
  const values = [devId, devTargetBotId, devApiUrl, devWorkspaceId]
  const isComplete = values.every((value) => value !== undefined)
  const isClear = values.every((value) => value === undefined)
  if (!isComplete && !isClear) {
    throw new errors.BotpressCLIError('The agent dev target quartet must contain all four scoped fields or clear all four.')
  }
  if (isComplete) {
    if (!/^[1-9][0-9]*$/.test(devTargetBotId!)) {
      throw new errors.BotpressCLIError('agent.local.json devTargetBotId must be a positive decimal string')
    }
    const canonicalApiUrl = normalizeApiUrl(devApiUrl!)
    if (!canonicalApiUrl || !devId!.trim() || !devWorkspaceId!.trim()) {
      throw new errors.BotpressCLIError('The agent dev target quartet must contain non-empty exact values.')
    }
    writeAgentLocalInfo(dir, {
      devId,
      devTargetBotId,
      devApiUrl: canonicalApiUrl,
      devWorkspaceId,
    })
    return
  }
  writeAgentLocalInfo(dir, {
    devId: undefined,
    devTargetBotId: undefined,
    devApiUrl: undefined,
    devWorkspaceId: undefined,
  })
}

// ---- Stage 2b: agent.json as the canonical prod link ----------------------
//
// Net rule: agent.config.ts present => agent.json is canonical; bot.json
// (cloud-project-link.ts's BotLink) is legacy-fallback-only (read) for ONE
// release, then dropped. These two pure helpers are factored out of
// deploy-command.ts's _deployAdkBundle so the precedence/migration logic is
// unit-testable without spinning up the whole deploy command.

// READ precedence for the prod bot id (agent projects): --bot-id flag wins,
// then agent.json.botId (the canonical link), then bot.json's link.botId
// (legacy graceful fallback, only reached when agent.json is absent).
// bot.json's botId is a NUMBER (BotLink); agent.json's is already a STRING.
export function resolveAgentBotId(
  argvBotId: string | undefined,
  agentInfo: AgentInfo | undefined,
  linkBotId: number | undefined
): string | undefined {
  return argvBotId ?? agentInfo?.botId ?? (linkBotId !== undefined ? String(linkBotId) : undefined)
}

// True when the deploy target is Botpress Cloud (where UUID bot ids are valid).
// Parsed via URL so it is robust to scheme/port/trailing path; a non-URL string
// is treated as NOT Botpress Cloud (our self-hosted cloudapi is the default),
// which keeps the stale-UUID guard active rather than silently bypassing it.
export function isBotpressCloudHost(apiUrl: string): boolean {
  try {
    const host = new URL(apiUrl).hostname
    return host === 'botpress.cloud' || host.endsWith('.botpress.cloud')
  } catch {
    return false
  }
}

// Stale-migration guard for `brt deploy --adk`. Our cloudapi resolves bots by a
// NUMERIC id, but a bot migrated off Botpress Cloud still carries a UUID botId
// in agent.json; a non-numeric id can never deploy against our cloudapi
// (guaranteed 404). Returns an actionable error message when the resolved botId
// is not deployable to `apiUrl`, or undefined when the deploy may proceed.
// Skipped for an explicit --bot-id override (the user's escape hatch) and for
// Botpress Cloud targets (where UUID ids are valid).
export function checkDeployableBotId(
  resolvedBotId: string | undefined,
  argvBotId: string | undefined,
  apiUrl: string
): string | undefined {
  if (resolvedBotId === undefined) return undefined // nothing resolved → provision path
  if (argvBotId !== undefined) return undefined // explicit --bot-id override — user's call
  if (/^\d+$/.test(resolvedBotId)) return undefined // numeric → deployable
  if (isBotpressCloudHost(apiUrl)) return undefined // UUID is valid against Botpress Cloud
  // A non-numeric id can never deploy against our numeric-only cloudapi.
  if (resolvedBotId.trim() === '') {
    return (
      `agent.json has a blank botId, but ${apiUrl} resolves bots by numeric id. ` +
      `Set agent.json's botId to the numeric bot id, or pass --bot-id <N>.`
    )
  }
  return (
    `agent.json botId "${resolvedBotId}" looks like a Botpress Cloud id, but you are deploying to ${apiUrl}, ` +
    `which resolves bots by numeric id. Update agent.json's botId to the numeric bot id, or pass --bot-id <N>.`
  )
}

// Stale/diverging-credential guard for `brt deploy --adk`'s table sync step.
// TableManager's own credential resolution (@holocronlab/botruntime-adk's
// resolveProjectCredentials) prefers the EFFECTIVE agentInfo — agent.json
// MERGED with agent.local.json overrides — over any credentials explicitly
// passed to it (agentInfo.workspaceId/apiUrl win over the caller's
// baseCredentials there). Comparing only the raw, pre-merge agent.json (as
// deploy-command.ts used to) misses an agent.local.json override entirely and
// lets table sync silently target a different workspace/server than the one
// `deploy` just PUT the bundle to. `effective` must be the POST-AgentProject
// .load() value (project.agentInfo); `raw` is the pre-merge agent.json read
// (used only to attribute the mismatch to the right file in the message).
export function checkTableSyncCredentialMismatch(
  effective: Pick<AgentInfo, 'workspaceId' | 'apiUrl'> | undefined,
  raw: Pick<AgentInfo, 'workspaceId' | 'apiUrl'> | undefined,
  profile: { workspaceId?: string; apiUrl: string }
): string | undefined {
  if (effective?.workspaceId && effective.workspaceId !== profile.workspaceId) {
    const source = effective.workspaceId !== raw?.workspaceId ? 'agent.local.json' : 'agent.json'
    return (
      `table sync: ${source} resolves workspaceId=${effective.workspaceId}, which does not match the deploying ` +
      `profile's workspaceId (${profile.workspaceId}) — fix the override or re-run \`brt login\` before deploying`
    )
  }
  if (effective?.apiUrl && effective.apiUrl !== profile.apiUrl) {
    const source = effective.apiUrl !== raw?.apiUrl ? 'agent.local.json' : 'agent.json'
    return (
      `table sync: ${source} resolves apiUrl=${effective.apiUrl}, which does not match the deploying profile's ` +
      `apiUrl (${profile.apiUrl}) — fix the override or re-run \`brt login\` before deploying`
    )
  }
  return undefined
}

// One-time auto-migration: when bot.json already links a bot (link.botId
// present) but agent.json is absent, compute the agent.json contents to
// write so agent.json becomes canonical from here on. Returns undefined when
// no migration is needed (agent.json already present) OR when there is
// nothing to migrate (bot.json has no botId either).
//
// workspaceId prefers bot.json's own link.workspaceId; when that is absent
// falls back to the resolved profile's workspaceId. Never writes an empty/
// unknown workspaceId — if neither source has one, migration is skipped
// (the caller keeps reading bot.json as fallback; nothing is lost).
export function computeAutoMigrateInfo(
  agentInfo: AgentInfo | undefined,
  link: { botId?: number; workspaceId?: number },
  resolvedBotId: string | undefined,
  profileWorkspaceId: string | undefined,
  apiUrl: string | undefined
): AgentInfo | undefined {
  if (agentInfo !== undefined) return undefined // agent.json already canonical
  if (link.botId === undefined) return undefined // only migrate when a legacy bot.json link exists
  if (resolvedBotId === undefined) return undefined // nothing to persist
  const workspaceId = link.workspaceId !== undefined ? String(link.workspaceId) : profileWorkspaceId
  if (workspaceId === undefined) return undefined
  // Persist the RESOLVED bot id (which honors an explicit --bot-id override),
  // NOT link.botId: `deploy --adk --bot-id 999` against a legacy bot.json(123)
  // deploys to 999, so agent.json must become 999 too — writing 123 here would
  // silently diverge the canonical link from the deployed bot on the next run.
  return { botId: resolvedBotId, workspaceId, apiUrl }
}
