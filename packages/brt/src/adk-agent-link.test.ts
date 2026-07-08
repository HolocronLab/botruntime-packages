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

  describe('writeAgentInfo', () => {
    it('writes agent.json in adk key order [botId, workspaceId, apiUrl], no trailing newline', () => {
      agentLink.writeAgentInfo(dir, { botId: 'bot_1', workspaceId: 'ws_1', apiUrl: 'https://api.botruntime.ru' })

      const raw = fs.readFileSync(agentLink.agentInfoFilePath(dir), 'utf-8')
      expect(raw).toBe(
        JSON.stringify({ botId: 'bot_1', workspaceId: 'ws_1', apiUrl: 'https://api.botruntime.ru' }, null, 2)
      )
      expect(raw.endsWith('\n')).toBe(false)
      expect(agentLink.readAgentInfoIfPresent(dir)).toEqual({
        botId: 'bot_1',
        workspaceId: 'ws_1',
        apiUrl: 'https://api.botruntime.ru',
      })
    })

    it('drops apiUrl entirely rather than writing a literal null/undefined', () => {
      agentLink.writeAgentInfo(dir, { botId: 'bot_1', workspaceId: 'ws_1', apiUrl: undefined })

      const raw = fs.readFileSync(agentLink.agentInfoFilePath(dir), 'utf-8')
      expect(raw).toBe(JSON.stringify({ botId: 'bot_1', workspaceId: 'ws_1' }, null, 2))
      expect(raw.includes('apiUrl')).toBe(false)
    })

    it('overwrites an existing agent.json', () => {
      agentLink.writeAgentInfo(dir, { botId: 'bot_1', workspaceId: 'ws_1' })
      agentLink.writeAgentInfo(dir, { botId: 'bot_2', workspaceId: 'ws_2', apiUrl: 'https://new.example' })

      expect(agentLink.readAgentInfoIfPresent(dir)).toEqual({
        botId: 'bot_2',
        workspaceId: 'ws_2',
        apiUrl: 'https://new.example',
      })
    })
  })

  describe('resolveAgentBotId', () => {
    it('prefers --bot-id over everything else', () => {
      expect(agentLink.resolveAgentBotId('argv_bot', { botId: 'agent_bot', workspaceId: 'ws' }, 999)).toBe('argv_bot')
    })

    it('prefers agent.json.botId over bot.json link.botId', () => {
      expect(agentLink.resolveAgentBotId(undefined, { botId: 'agent_bot', workspaceId: 'ws' }, 999)).toBe('agent_bot')
    })

    it('falls back to bot.json link.botId (stringified) when agent.json is absent', () => {
      expect(agentLink.resolveAgentBotId(undefined, undefined, 999)).toBe('999')
    })

    it('returns undefined when all three are absent (provision case)', () => {
      expect(agentLink.resolveAgentBotId(undefined, undefined, undefined)).toBeUndefined()
    })
  })

  describe('isBotpressCloudHost', () => {
    it('recognizes botpress.cloud and its subdomains', () => {
      expect(agentLink.isBotpressCloudHost('https://botpress.cloud')).toBe(true)
      expect(agentLink.isBotpressCloudHost('https://api.botpress.cloud/v1')).toBe(true)
      expect(agentLink.isBotpressCloudHost('https://api.botpress.cloud:443')).toBe(true)
    })

    it('does not match our self-hosted cloudapi or look-alikes', () => {
      expect(agentLink.isBotpressCloudHost('https://botruntime.ru')).toBe(false)
      expect(agentLink.isBotpressCloudHost('https://botpress.cloud.evil.com')).toBe(false)
      expect(agentLink.isBotpressCloudHost('http://localhost:8090')).toBe(false)
    })

    it('treats a non-URL string as NOT Botpress Cloud (keeps the guard active)', () => {
      expect(agentLink.isBotpressCloudHost('not a url')).toBe(false)
    })
  })

  describe('checkDeployableBotId', () => {
    const UUID = '5e14d95c-1111-2222-3333-444455556666'

    it('fails a UUID botId (from agent.json) against our numeric-only cloudapi', () => {
      const err = agentLink.checkDeployableBotId(UUID, undefined, 'https://botruntime.ru')
      expect(err).toContain(UUID)
      expect(err).toContain('numeric')
      expect(err).toContain('--bot-id')
    })

    it('passes a numeric botId', () => {
      expect(agentLink.checkDeployableBotId('3', undefined, 'https://botruntime.ru')).toBeUndefined()
    })

    it('skips the check for an explicit --bot-id override (user escape hatch)', () => {
      expect(agentLink.checkDeployableBotId(UUID, UUID, 'https://botruntime.ru')).toBeUndefined()
    })

    it('allows a UUID botId when the target really is Botpress Cloud', () => {
      expect(agentLink.checkDeployableBotId(UUID, undefined, 'https://api.botpress.cloud')).toBeUndefined()
    })

    it('returns undefined when nothing is resolved (provision path)', () => {
      expect(agentLink.checkDeployableBotId(undefined, undefined, 'https://botruntime.ru')).toBeUndefined()
    })

    it('gives a blank-botId message (not "Botpress Cloud id") for an empty botId', () => {
      const err = agentLink.checkDeployableBotId('', undefined, 'https://botruntime.ru')
      expect(err).toContain('blank botId')
      expect(err).not.toContain('looks like a Botpress Cloud id')
      expect(err).toContain('--bot-id')
    })
  })

  describe('checkTableSyncCredentialMismatch', () => {
    it('passes when the effective agentInfo matches the deploying profile', () => {
      const effective = { botId: 'bot_1', workspaceId: 'ws_1', apiUrl: 'https://api.example' }
      const err = agentLink.checkTableSyncCredentialMismatch(effective, effective, {
        workspaceId: 'ws_1',
        apiUrl: 'https://api.example',
      })
      expect(err).toBeUndefined()
    })

    it('passes when agentInfo carries no workspaceId/apiUrl at all', () => {
      const err = agentLink.checkTableSyncCredentialMismatch(undefined, undefined, {
        workspaceId: 'ws_1',
        apiUrl: 'https://api.example',
      })
      expect(err).toBeUndefined()
    })

    it('fails loud and blames agent.local.json when its workspaceId override diverges from the profile', () => {
      // raw = agent.json alone (ws_1, matches the profile); effective = AgentProject's
      // MERGED value (agent.local.json overrides workspaceId to ws_evil) — this is the
      // exact silent-divergence TableManager's own resolveProjectCredentials would fall
      // for (agentInfo.workspaceId wins over the passed-in credentials).
      const raw = { botId: 'bot_1', workspaceId: 'ws_1', apiUrl: 'https://api.example' }
      const effective = { botId: 'bot_1', workspaceId: 'ws_evil', apiUrl: 'https://api.example' }
      const err = agentLink.checkTableSyncCredentialMismatch(effective, raw, {
        workspaceId: 'ws_1',
        apiUrl: 'https://api.example',
      })
      expect(err).toContain('agent.local.json')
      expect(err).toContain('ws_evil')
      expect(err).toContain('ws_1')
    })

    it('fails loud and blames agent.local.json when its apiUrl override diverges from the profile', () => {
      const raw = { botId: 'bot_1', workspaceId: 'ws_1', apiUrl: 'https://api.example' }
      const effective = { botId: 'bot_1', workspaceId: 'ws_1', apiUrl: 'https://evil.example' }
      const err = agentLink.checkTableSyncCredentialMismatch(effective, raw, {
        workspaceId: 'ws_1',
        apiUrl: 'https://api.example',
      })
      expect(err).toContain('agent.local.json')
      expect(err).toContain('evil.example')
    })

    it('blames agent.json (not agent.local.json) when there is no local override and agent.json itself is stale', () => {
      const raw = { botId: 'bot_1', workspaceId: 'ws_stale', apiUrl: 'https://api.example' }
      const err = agentLink.checkTableSyncCredentialMismatch(raw, raw, {
        workspaceId: 'ws_1',
        apiUrl: 'https://api.example',
      })
      expect(err).toContain('agent.json')
      expect(err).not.toContain('agent.local.json')
    })

    it('checks workspaceId before apiUrl and reports only the first mismatch', () => {
      const raw = { workspaceId: 'ws_1', apiUrl: 'https://api.example' }
      const effective = { workspaceId: 'ws_evil', apiUrl: 'https://evil.example' }
      const err = agentLink.checkTableSyncCredentialMismatch(effective, raw, {
        workspaceId: 'ws_1',
        apiUrl: 'https://api.example',
      })
      expect(err).toContain('workspaceId')
      expect(err).not.toContain('apiUrl')
    })
  })

  describe('computeAutoMigrateInfo', () => {
    it('returns undefined when agent.json is already present (no migration needed)', () => {
      const result = agentLink.computeAutoMigrateInfo(
        { botId: 'agent_bot', workspaceId: 'ws' },
        { botId: 3, workspaceId: 5 },
        '3',
        'profile_ws',
        'https://api.example'
      )
      expect(result).toBeUndefined()
    })

    it('returns undefined when bot.json has no botId either (nothing to migrate)', () => {
      const result = agentLink.computeAutoMigrateInfo(undefined, {}, undefined, 'profile_ws', 'https://api.example')
      expect(result).toBeUndefined()
    })

    it('migrates from bot.json link.workspaceId when present', () => {
      const result = agentLink.computeAutoMigrateInfo(
        undefined,
        { botId: 3, workspaceId: 5 },
        '3',
        'profile_ws',
        'https://api.example'
      )
      expect(result).toEqual({ botId: '3', workspaceId: '5', apiUrl: 'https://api.example' })
    })

    it('falls back to the profile workspaceId when bot.json has none', () => {
      const result = agentLink.computeAutoMigrateInfo(undefined, { botId: 3 }, '3', 'profile_ws', 'https://api.example')
      expect(result).toEqual({ botId: '3', workspaceId: 'profile_ws', apiUrl: 'https://api.example' })
    })

    it('skips migration (returns undefined) when neither bot.json nor profile has a workspaceId', () => {
      const result = agentLink.computeAutoMigrateInfo(undefined, { botId: 3 }, '3', undefined, 'https://api.example')
      expect(result).toBeUndefined()
    })

    it('persists the RESOLVED botId (honors --bot-id override), not the legacy bot.json botId', () => {
      // deploy --adk --bot-id 999 against legacy bot.json(3): agent.json must
      // become 999 (the deployed bot), never 3 — else the next run silently
      // targets 3.
      const result = agentLink.computeAutoMigrateInfo(
        undefined,
        { botId: 3, workspaceId: 5 },
        '999',
        'profile_ws',
        'https://api.example'
      )
      expect(result).toEqual({ botId: '999', workspaceId: '5', apiUrl: 'https://api.example' })
    })

    it('skips migration when the resolved botId is undefined', () => {
      const result = agentLink.computeAutoMigrateInfo(
        undefined,
        { botId: 3, workspaceId: 5 },
        undefined,
        'profile_ws',
        'https://api.example'
      )
      expect(result).toBeUndefined()
    })
  })
})
