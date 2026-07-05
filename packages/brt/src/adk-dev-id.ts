import * as fs from 'fs'
import * as path from 'path'
import * as agentLink from './adk-agent-link'
import * as errors from './errors'
import type { Logger } from './logger'

// Cross-run dev-bot PERSISTENCE bridge between the ADK generator's internal
// DevIdManager (packages/botruntime-adk/src/bot-generator/dev-id-manager.ts)
// and the classic DevCommand's own project cache
// (<botPath>/.botpress/project.cache.json, see project-command.ts's
// ProjectCache: { botId, devId, tunnelId, secrets }).
//
// CRITICAL BACKEND FACT: in this fork the dev bot's id === the tunnel id (the
// server derives ext_id from the last path segment of the tunnel URL). So
// reusing a dev bot across `brt dev` runs requires the CLASSIC dev's
// `tunnelId` (project-command.ts / dev-command.ts run(), which builds the
// tunnel URL) to equal the persisted `devId` — otherwise a same devId with a
// different tunnelId mints a fresh dev bot on the server.
//
// Every call to generateBotProject() (i.e. every adkBundle.generateAgentBot)
// runs the ADK generator's own DevIdManager.restoreDevId() as a side effect,
// which — whenever agent.local.json has a devId or botId — OVERWRITES
// <botPath>/.botpress/project.cache.json with ONLY `{ devId, botId }`,
// dropping any existing `tunnelId`/`secrets`. restoreDevTunnelId() repairs
// that immediately after generation: it sets tunnelId = devId in the nested
// cache so the classic dev's tunnelId read sees a match.
//
// preserveDevId() runs the other direction: after the classic dev's own run()
// has (re)deployed and cached a (possibly newly-minted) `devId` into the
// nested project cache, it copies that id back out to the agent project's
// agent.local.json so the NEXT `brt dev` run's initial generate has a devId
// to restore in the first place.
//
// Both helpers are best-effort dev-session PERSISTENCE, not correctness paths
// for the live tunnel/session: an IO hiccup here must never kill an otherwise
// working `brt dev` — it only means the next run mints a fresh dev bot, which
// is exactly today's (pre-Stage-2a) behavior. So every failure is caught and
// logged at debug level, never thrown.

interface NestedProjectCache {
  botId?: string
  devId?: string
  tunnelId?: string
  secrets?: Record<string, string>
}

function nestedProjectCachePath(botPath: string): string {
  return path.join(botPath, '.botpress', 'project.cache.json')
}

function readNestedProjectCache(botPath: string): NestedProjectCache {
  const cachePath = nestedProjectCachePath(botPath)
  if (!fs.existsSync(cachePath)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as NestedProjectCache
  } catch {
    return {}
  }
}

function writeNestedProjectCache(botPath: string, cache: NestedProjectCache): void {
  const cachePath = nestedProjectCachePath(botPath)
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2))
}

// After (re)generating the synthetic classic bot, repair the tunnelId the ADK
// generator's own DevIdManager.restoreDevId() just dropped: if the nested
// project cache has a devId, set tunnelId = devId so the classic dev's
// tunnelId read (dev-command.ts run(), cachedTunnelId precedence) reuses the
// SAME tunnel URL that the dev bot was originally provisioned under.
// Best-effort: never throws.
export function restoreDevTunnelId(botPath: string, logger?: Pick<Logger, 'debug'>): void {
  try {
    const cache = readNestedProjectCache(botPath)
    if (!cache.devId) return
    if (cache.tunnelId === cache.devId) return
    writeNestedProjectCache(botPath, { ...cache, tunnelId: cache.devId })
  } catch (thrown) {
    const err = errors.BotpressCLIError.wrap(thrown, 'agent dev: restoreDevTunnelId failed (non-fatal)')
    logger?.debug(err.message)
  }
}

// After the classic nested dev has run (and possibly minted/deployed a dev
// bot, caching its id as `devId` in the nested project cache), persist that
// devId to the agent project's agent.local.json so the NEXT `brt dev` run's
// initial generate has a devId for the ADK generator's restoreDevId() to seed
// back into a fresh nested cache. Best-effort: never throws.
export function preserveDevId(agentDir: string, botPath: string, logger?: Pick<Logger, 'debug'>): void {
  try {
    const cache = readNestedProjectCache(botPath)
    if (!cache.devId) return
    agentLink.writeAgentLocalDevId(agentDir, cache.devId)
  } catch (thrown) {
    const err = errors.BotpressCLIError.wrap(thrown, 'agent dev: preserveDevId failed (non-fatal)')
    logger?.debug(err.message)
  }
}
