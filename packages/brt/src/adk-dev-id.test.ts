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
      // Legacy nested caches may contain only the opaque identity. Repairing
      // the tunnel must not invent a numeric control-plane target.
      writeNestedCache(botPath, { devId: 'dev_abc', botId: 'bot_1' })

      adkDevId.restoreDevTunnelId(botPath)

      expect(readNestedCache(botPath)).toEqual({
        devId: 'dev_abc',
        botId: 'bot_1',
        tunnelId: 'dev_abc',
      })
    })

    it('preserves other cache fields (e.g. secrets) while repairing tunnelId', () => {
      writeNestedCache(botPath, {
        devId: 'dev_abc',
        botId: 'bot_1',
        secrets: { FOO: 'bar' },
      })

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
      expect(readNestedCache(botPath)).toEqual({
        devId: 'dev_abc',
        tunnelId: 'dev_abc',
      })
    })

    it('fails soft on invalid JSON in the nested cache instead of throwing', () => {
      fs.mkdirSync(path.dirname(nestedCachePath(botPath)), { recursive: true })
      fs.writeFileSync(nestedCachePath(botPath), '{not json')
      expect(() => adkDevId.restoreDevTunnelId(botPath)).not.toThrow()
    })

    it('does not attach a stale numeric target when the nested runtime id changed', () => {
      fs.writeFileSync(
        agentLink.agentLocalInfoFilePath(agentDir),
        JSON.stringify({ devId: 'runtime-a', devTargetBotId: '42' })
      )
      writeNestedCache(botPath, { devId: 'runtime-b' })

      adkDevId.restoreDevTunnelId(botPath)

      expect(readNestedCache(botPath)).toEqual({
        devId: 'runtime-b',
        tunnelId: 'runtime-b',
      })
    })

    it('restores the complete scoped tuple from agent.local only when the runtime id matches', () => {
      fs.writeFileSync(
        agentLink.agentLocalInfoFilePath(agentDir),
        JSON.stringify({
          devId: 'shared-runtime',
          devTargetBotId: '42',
          devApiUrl: 'https://cloud.example',
          devWorkspaceId: 'cloud_ws',
        })
      )
      writeNestedCache(botPath, { devId: 'shared-runtime', botId: 'prod_bot' })

      adkDevId.restoreDevTunnelId(botPath)

      expect(readNestedCache(botPath)).toEqual({
        devId: 'shared-runtime',
        devTargetBotId: '42',
        devApiUrl: 'https://cloud.example',
        devWorkspaceId: 'cloud_ws',
        botId: 'prod_bot',
        tunnelId: 'shared-runtime',
      })
    })
  })

  describe('preserveDevId', () => {
    it('does not persist an unscoped nested devId to agent.local.json', () => {
      writeNestedCache(botPath, { devId: 'dev_new', tunnelId: 'dev_new' })

      adkDevId.preserveDevId(agentDir, botPath)

      expect(agentLink.getAgentDevId(agentDir)).toBeUndefined()
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

    it('clears a previously persisted quartet when the nested runtime has no verified scope', () => {
      agentLink.writeAgentLocalDevTarget(agentDir, 'dev_old', '41', 'https://old.example', 'old_ws')
      writeNestedCache(botPath, { devId: 'dev_new' })

      adkDevId.preserveDevId(agentDir, botPath)

      expect(agentLink.getAgentDevId(agentDir)).toBeUndefined()
    })

    it('persists devTargetBotId beside the opaque devId without overwriting the production botId', () => {
      fs.writeFileSync(
        agentLink.agentInfoFilePath(agentDir),
        JSON.stringify({ botId: 'prod_bot', workspaceId: 'ws_1' })
      )
      writeNestedCache(botPath, {
        devId: 'dev_opaque',
        devTargetBotId: '42',
        devApiUrl: 'https://cloud.example',
        devWorkspaceId: 'cloud_ws',
        tunnelId: 'dev_opaque',
        botId: 'prod_bot',
      })

      adkDevId.preserveDevId(agentDir, botPath)

      expect(agentLink.readAgentLocalInfo(agentDir)).toEqual({
        devId: 'dev_opaque',
        devTargetBotId: '42',
        devApiUrl: 'https://cloud.example',
        devWorkspaceId: 'cloud_ws',
      })
      expect(agentLink.readAgentLocalInfo(agentDir)).not.toHaveProperty('botId')
      expect(agentLink.readAgentInfoIfPresent(agentDir)?.botId).toBe('prod_bot')
    })

    it('persists the complete nested target scope without dropping any quartet field', () => {
      writeNestedCache(botPath, {
        devId: 'dev_opaque',
        devTargetBotId: '42',
        devApiUrl: 'https://cloud.example',
        devWorkspaceId: 'cloud_ws',
        tunnelId: 'dev_opaque',
      })

      adkDevId.preserveDevId(agentDir, botPath)

      expect(agentLink.readAgentLocalInfo(agentDir)).toEqual({
        devId: 'dev_opaque',
        devTargetBotId: '42',
        devApiUrl: 'https://cloud.example',
        devWorkspaceId: 'cloud_ws',
      })
    })

    it('clears the stale numeric target when a new opaque devId has no verified target', () => {
      fs.writeFileSync(
        agentLink.agentLocalInfoFilePath(agentDir),
        JSON.stringify({
          workspaceId: 'ws_local',
          apiUrl: 'http://127.0.0.1:8787',
          devId: 'runtime-a',
          devTargetBotId: '42',
        })
      )
      writeNestedCache(botPath, {
        devId: 'runtime-b',
        tunnelId: 'runtime-b',
      })

      adkDevId.preserveDevId(agentDir, botPath)

      expect(agentLink.readAgentLocalInfo(agentDir)).toEqual({
        workspaceId: 'ws_local',
        apiUrl: 'http://127.0.0.1:8787',
      })
    })
  })

  describe('round-trip: restoreDevTunnelId + preserveDevId across two simulated runs', () => {
    it('reuses the same devId/tunnelId on the second run', () => {
      // Run 1: nested cache starts fresh; classic dev mints a devId and sets
      // tunnelId itself (via project-command.ts), independent of these helpers.
      writeNestedCache(botPath, {
        devId: 'dev_reused',
        devTargetBotId: '42',
        devApiUrl: 'https://cloud.example',
        devWorkspaceId: 'cloud_ws',
        tunnelId: 'dev_reused',
      })
      adkDevId.preserveDevId(agentDir, botPath)
      expect(agentLink.getAgentDevId(agentDir)).toBe('dev_reused')

      // A legacy/bootstrap nested cache may retain the opaque id while losing
      // the transient tunnel field between runs.
      writeNestedCache(botPath, { devId: 'dev_reused', botId: 'bot_1' })

      // Run 2: restoreDevTunnelId repairs tunnelId before the classic dev reads it.
      adkDevId.restoreDevTunnelId(botPath)
      expect(readNestedCache(botPath)).toEqual({
        devId: 'dev_reused',
        devTargetBotId: '42',
        devApiUrl: 'https://cloud.example',
        devWorkspaceId: 'cloud_ws',
        botId: 'bot_1',
        tunnelId: 'dev_reused',
      })
    })

    it('does not restore an unscoped numeric target from agent.local', () => {
      fs.writeFileSync(
        agentLink.agentLocalInfoFilePath(agentDir),
        JSON.stringify({ devId: 'dev_opaque', devTargetBotId: '42' })
      )
      writeNestedCache(botPath, { devId: 'dev_opaque', botId: 'prod_bot' })

      adkDevId.restoreDevTunnelId(botPath)

      expect(readNestedCache(botPath)).toEqual({
        devId: 'dev_opaque',
        botId: 'prod_bot',
        tunnelId: 'dev_opaque',
      })
      expect(agentLink.readAgentLocalInfo(agentDir)).not.toHaveProperty('botId')
    })
  })
})
