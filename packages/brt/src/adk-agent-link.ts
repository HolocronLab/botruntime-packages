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
}

const AGENT_INFO_FILE = 'agent.json'
const AGENT_LOCAL_INFO_FILE = 'agent.local.json'

const AGENT_INFO_KEY_ORDER = ['botId', 'workspaceId', 'apiUrl'] as const
const AGENT_LOCAL_INFO_KEY_ORDER = ['botId', 'workspaceId', 'apiUrl', 'devId'] as const

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
  const toWrite: Record<string, unknown> = { botId: info.botId, workspaceId: info.workspaceId }
  if (info.apiUrl !== undefined) toWrite['apiUrl'] = info.apiUrl
  fs.writeFileSync(agentInfoFilePath(dir), stringifyWithOrder(toWrite, AGENT_INFO_KEY_ORDER))
}

export function readAgentInfoIfPresent(dir: string): AgentInfo | undefined {
  const filePath = agentInfoFilePath(dir)
  if (!fs.existsSync(filePath)) return undefined
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AgentInfo
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `${AGENT_INFO_FILE} is not valid JSON`)
  }
}

export function readAgentLocalInfo(dir: string): AgentLocalInfo {
  const filePath = agentLocalInfoFilePath(dir)
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AgentLocalInfo
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `${AGENT_LOCAL_INFO_FILE} is not valid JSON`)
  }
}

// Convenience accessor for the persisted dev bot id (the ONE value that also
// doubles as the reused dev tunnel's id — see adk-dev-id.ts).
export function getAgentDevId(dir: string): string | undefined {
  return readAgentLocalInfo(dir).devId
}

// Merges `devId` into agent.local.json, preserving any existing keys
// (botId/workspaceId/apiUrl overrides a developer may have set). Passing
// `undefined` clears the field. If the merged object ends up empty, the file
// is removed entirely — mirrors AgentProject.updateAgentLocalInfo's
// unlink-if-empty behavior, so agent.local.json never lingers as an empty `{}`.
export function writeAgentLocalDevId(dir: string, devId: string | undefined): void {
  const filePath = agentLocalInfoFilePath(dir)
  const existing = readAgentLocalInfo(dir)
  const merged: AgentLocalInfo = { ...existing, devId }
  for (const key of Object.keys(merged) as (keyof AgentLocalInfo)[]) {
    if (merged[key] === undefined) delete merged[key]
  }

  if (Object.keys(merged).length === 0) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return
  }

  fs.writeFileSync(filePath, stringifyWithOrder(merged as unknown as Record<string, unknown>, AGENT_LOCAL_INFO_KEY_ORDER))
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
