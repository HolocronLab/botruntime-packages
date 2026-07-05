import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as agentLink from './adk-agent-link'
import * as adkDevId from './adk-dev-id'

function nestedCachePath(botPath: string): string {
  return path.join(botPath, '.botpress', 'project.cache.json')
}

function writeNestedCache(botPath: string, cache: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(nestedCachePath(botPath)), { recursive: true })
  fs.writeFileSync(nestedCachePath(botPath), JSON.stringify(cache, null, 2))
}

function readNestedCache(botPath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(nestedCachePath(botPath), 'utf-8'))
}

describe('adk-dev-id', () => {
  let agentDir: string
  let botPath: string

  beforeEach(() => {
    agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-adk-devid-agent-'))
    botPath = path.join(agentDir, '.adk', 'bot')
    fs.mkdirSync(botPath, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(agentDir, { recursive: true, force: true })
  })

  describe('restoreDevTunnelId', () => {
    it('sets tunnelId = devId when the nested cache has a devId but no matching tunnelId', () => {
      // Mirrors what @holocronlab/botruntime-adk's DevIdManager.restoreDevId()
      // leaves behind: only { devId, botId }, tunnelId dropped.
      writeNestedCache(botPath, { devId: 'dev_abc', botId: 'bot_1' })

      adkDevId.restoreDevTunnelId(botPath)

      expect(readNestedCache(botPath)).toEqual({ devId: 'dev_abc', botId: 'bot_1', tunnelId: 'dev_abc' })
    })

    it('preserves other cache fields (e.g. secrets) while repairing tunnelId', () => {
      writeNestedCache(botPath, { devId: 'dev_abc', botId: 'bot_1', secrets: { FOO: 'bar' } })

      adkDevId.restoreDevTunnelId(botPath)

      expect(readNestedCache(botPath)).toEqual({
        devId: 'dev_abc',
        botId: 'bot_1',
        secrets: { FOO: 'bar' },
        tunnelId: 'dev_abc',
      })
    })

    it('is a no-op when there is no devId in the nested cache', () => {
      writeNestedCache(botPath, { tunnelId: 'some-uuid' })
      adkDevId.restoreDevTunnelId(botPath)
      expect(readNestedCache(botPath)).toEqual({ tunnelId: 'some-uuid' })
    })

    it('is a no-op when the nested cache file does not exist', () => {
      expect(fs.existsSync(nestedCachePath(botPath))).toBe(false)
      expect(() => adkDevId.restoreDevTunnelId(botPath)).not.toThrow()
      expect(fs.existsSync(nestedCachePath(botPath))).toBe(false)
    })

    it('is a no-op when tunnelId already equals devId', () => {
      writeNestedCache(botPath, { devId: 'dev_abc', tunnelId: 'dev_abc' })
      adkDevId.restoreDevTunnelId(botPath)
      expect(readNestedCache(botPath)).toEqual({ devId: 'dev_abc', tunnelId: 'dev_abc' })
    })

    it('fails soft on invalid JSON in the nested cache instead of throwing', () => {
      fs.mkdirSync(path.dirname(nestedCachePath(botPath)), { recursive: true })
      fs.writeFileSync(nestedCachePath(botPath), '{not json')
      expect(() => adkDevId.restoreDevTunnelId(botPath)).not.toThrow()
    })
  })

  describe('preserveDevId', () => {
    it('writes the nested cache devId to agent.local.json', () => {
      writeNestedCache(botPath, { devId: 'dev_new', tunnelId: 'dev_new' })

      adkDevId.preserveDevId(agentDir, botPath)

      expect(agentLink.getAgentDevId(agentDir)).toBe('dev_new')
    })

    it('is a no-op when the nested cache has no devId', () => {
      writeNestedCache(botPath, { tunnelId: 'some-uuid' })
      adkDevId.preserveDevId(agentDir, botPath)
      expect(agentLink.getAgentDevId(agentDir)).toBeUndefined()
    })

    it('is a no-op when the nested cache file does not exist', () => {
      expect(() => adkDevId.preserveDevId(agentDir, botPath)).not.toThrow()
      expect(agentLink.getAgentDevId(agentDir)).toBeUndefined()
    })

    it('overwrites a previously persisted devId with a newly minted one', () => {
      agentLink.writeAgentLocalDevId(agentDir, 'dev_old')
      writeNestedCache(botPath, { devId: 'dev_new' })

      adkDevId.preserveDevId(agentDir, botPath)

      expect(agentLink.getAgentDevId(agentDir)).toBe('dev_new')
    })
  })

  describe('round-trip: restoreDevTunnelId + preserveDevId across two simulated runs', () => {
    it('reuses the same devId/tunnelId on the second run', () => {
      // Run 1: nested cache starts fresh; classic dev mints a devId and sets
      // tunnelId itself (via project-command.ts), independent of these helpers.
      writeNestedCache(botPath, { devId: 'dev_reused', tunnelId: 'dev_reused' })
      adkDevId.preserveDevId(agentDir, botPath)
      expect(agentLink.getAgentDevId(agentDir)).toBe('dev_reused')

      // Between runs: the ADK generator's restoreDevId() would overwrite the
      // nested cache with only { devId, botId }, dropping tunnelId.
      writeNestedCache(botPath, { devId: 'dev_reused', botId: 'bot_1' })

      // Run 2: restoreDevTunnelId repairs tunnelId before the classic dev reads it.
      adkDevId.restoreDevTunnelId(botPath)
      expect(readNestedCache(botPath)).toEqual({ devId: 'dev_reused', botId: 'bot_1', tunnelId: 'dev_reused' })
    })
  })
})
