import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as agentLink from './adk-agent-link'

describe('adk-agent-link', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-adk-agent-link-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  describe('readAgentInfoIfPresent', () => {
    it('returns undefined when agent.json is absent', () => {
      expect(agentLink.readAgentInfoIfPresent(dir)).toBeUndefined()
    })

    it('parses an existing agent.json', () => {
      fs.writeFileSync(
        agentLink.agentInfoFilePath(dir),
        JSON.stringify({ botId: 'bot_1', workspaceId: 'ws_1', apiUrl: 'https://api.botruntime.ru' })
      )
      expect(agentLink.readAgentInfoIfPresent(dir)).toEqual({
        botId: 'bot_1',
        workspaceId: 'ws_1',
        apiUrl: 'https://api.botruntime.ru',
      })
    })

    it('fails loud on invalid JSON', () => {
      fs.writeFileSync(agentLink.agentInfoFilePath(dir), '{not json')
      expect(() => agentLink.readAgentInfoIfPresent(dir)).toThrow(/not valid JSON/)
    })
  })

  describe('readAgentLocalInfo', () => {
    it('returns {} when agent.local.json is absent', () => {
      expect(agentLink.readAgentLocalInfo(dir)).toEqual({})
    })

    it('fails loud on invalid JSON', () => {
      fs.writeFileSync(agentLink.agentLocalInfoFilePath(dir), '{not json')
      expect(() => agentLink.readAgentLocalInfo(dir)).toThrow(/not valid JSON/)
    })
  })

  describe('writeAgentLocalDevId / getAgentDevId', () => {
    it('creates agent.local.json with only devId when none exists', () => {
      agentLink.writeAgentLocalDevId(dir, 'dev_123')
      expect(agentLink.getAgentDevId(dir)).toBe('dev_123')

      const raw = fs.readFileSync(agentLink.agentLocalInfoFilePath(dir), 'utf-8')
      expect(raw).toBe(JSON.stringify({ devId: 'dev_123' }, null, 2))
      // No trailing newline — byte-shape-compatible with @holocronlab/botruntime-adk.
      expect(raw.endsWith('\n')).toBe(false)
    })

    it('preserves existing keys and enforces adk key order [botId, workspaceId, apiUrl, devId]', () => {
      fs.writeFileSync(
        agentLink.agentLocalInfoFilePath(dir),
        JSON.stringify({ apiUrl: 'https://local.example', botId: 'bot_local' }, null, 2)
      )

      agentLink.writeAgentLocalDevId(dir, 'dev_456')

      const raw = fs.readFileSync(agentLink.agentLocalInfoFilePath(dir), 'utf-8')
      expect(raw).toBe(
        JSON.stringify({ botId: 'bot_local', apiUrl: 'https://local.example', devId: 'dev_456' }, null, 2)
      )
      expect(agentLink.readAgentLocalInfo(dir)).toEqual({
        botId: 'bot_local',
        apiUrl: 'https://local.example',
        devId: 'dev_456',
      })
    })

    it('updates an existing devId in place', () => {
      agentLink.writeAgentLocalDevId(dir, 'dev_1')
      agentLink.writeAgentLocalDevId(dir, 'dev_2')
      expect(agentLink.getAgentDevId(dir)).toBe('dev_2')
    })

    it('deletes agent.local.json when clearing devId leaves it empty', () => {
      agentLink.writeAgentLocalDevId(dir, 'dev_1')
      expect(fs.existsSync(agentLink.agentLocalInfoFilePath(dir))).toBe(true)

      agentLink.writeAgentLocalDevId(dir, undefined)
      expect(fs.existsSync(agentLink.agentLocalInfoFilePath(dir))).toBe(false)
      expect(agentLink.getAgentDevId(dir)).toBeUndefined()
    })

    it('keeps agent.local.json when other keys survive clearing devId', () => {
      fs.writeFileSync(agentLink.agentLocalInfoFilePath(dir), JSON.stringify({ botId: 'bot_local' }, null, 2))
      agentLink.writeAgentLocalDevId(dir, 'dev_1')
      agentLink.writeAgentLocalDevId(dir, undefined)

      expect(fs.existsSync(agentLink.agentLocalInfoFilePath(dir))).toBe(true)
      expect(agentLink.readAgentLocalInfo(dir)).toEqual({ botId: 'bot_local' })
    })

    it('is a no-op (no file created) when clearing devId on an already-empty/absent file', () => {
      agentLink.writeAgentLocalDevId(dir, undefined)
      expect(fs.existsSync(agentLink.agentLocalInfoFilePath(dir))).toBe(false)
    })
  })
})
