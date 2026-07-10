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
// CRITICAL IDENTITY FACT: opaque `devId` is the runtime/tunnel id, while
// `devTargetBotId` is the separate positive numeric control-plane id. The
// numeric id is valid only beside the exact opaque id the server verified;
// neither value may be substituted for the other or carried across a change
// of opaque runtime id.
//
// Resolved dev generation receives an already server-verified
// `{ devId, devTargetBotId }` pair. Bootstrap generation writes an empty cache,
// so an unverified pair cannot survive there. The ADK DevIdManager overwrites
// <botPath>/.botpress/project.cache.json with that exact state, dropping
// transient `tunnelId`/`secrets` fields.
// restoreDevTunnelId() repairs the tunnel field immediately after generation
// so the classic dev reads the opaque runtime id as its tunnel id.
//
// preserveDevId() runs the other direction: after the classic dev's own run()
// has cached the runtime identity in the nested project cache, it copies the
// pair back to agent.local.json. A cache with a new devId but no verified
// devTargetBotId explicitly clears the previous numeric target, forcing the
// next server operation to resolve it again instead of creating a split pair.
//
// Both helpers are best-effort dev-session PERSISTENCE, not correctness paths
// for the live tunnel/session: an IO hiccup here must never kill an otherwise
// working `brt dev`. Every failure is caught and logged at debug level, never
// thrown.

interface NestedProjectCache {
  botId?: string
  devId?: string
  devTargetBotId?: string
  devApiUrl?: string
  devWorkspaceId?: string
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
    const agentDir = path.dirname(path.dirname(botPath))
    const local = agentLink.readAgentLocalInfo(agentDir)
    const cacheHasScope = Boolean(
      cache.devTargetBotId && cache.devApiUrl && cache.devWorkspaceId
    )
    const localHasMatchingScope = Boolean(
      local.devId === cache.devId &&
        local.devTargetBotId &&
        local.devApiUrl &&
        local.devWorkspaceId
    )
    const source = cacheHasScope ? cache : localHasMatchingScope ? local : undefined
    const updated: NestedProjectCache = {
      ...cache,
      tunnelId: cache.devId,
    }
    if (source?.devTargetBotId && source.devApiUrl && source.devWorkspaceId) {
      updated.devTargetBotId = source.devTargetBotId
      updated.devApiUrl = source.devApiUrl.replace(/\/+$/, '')
      updated.devWorkspaceId = source.devWorkspaceId
    } else {
      delete updated.devTargetBotId
      delete updated.devApiUrl
      delete updated.devWorkspaceId
    }
    if (JSON.stringify(updated) === JSON.stringify(cache)) return
    writeNestedProjectCache(botPath, updated)
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
    if (cache.devTargetBotId && cache.devApiUrl && cache.devWorkspaceId) {
      agentLink.writeAgentLocalDevTarget(
        agentDir,
        cache.devId,
        cache.devTargetBotId,
        cache.devApiUrl,
        cache.devWorkspaceId
      )
    } else {
      agentLink.writeAgentLocalDevTarget(agentDir, undefined, undefined, undefined, undefined)
    }
  } catch (thrown) {
    const err = errors.BotpressCLIError.wrap(thrown, 'agent dev: preserveDevId failed (non-fatal)')
    logger?.debug(err.message)
  }
}
