import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as cloudLink from './cloud-project-link'

describe('cloud-project-link', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-cloud-link-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('uses bot.json for prod and bot.local.json for local', () => {
    expect(cloudLink.linkFileName('prod')).toBe('bot.json')
    expect(cloudLink.linkFileName('local')).toBe('bot.local.json')
  })

  it('loadLinkIfPresent returns undefined when no link file exists', () => {
    expect(cloudLink.loadLinkIfPresent(dir, 'prod')).toBeUndefined()
  })

  it('loadLink fails loud when no link file exists', () => {
    expect(() => cloudLink.loadLink(dir, 'prod')).toThrow(/bot\.json not found/)
  })

  it('round-trips a link through saveLink/loadLink', () => {
    const link: cloudLink.BotLink = { botId: 42, apiUrl: 'https://botruntime.ru', workspaceId: 7 }
    cloudLink.saveLink(dir, 'prod', link)
    expect(fs.existsSync(path.join(dir, 'bot.json'))).toBe(true)
    expect(cloudLink.loadLink(dir, 'prod')).toEqual(link)
  })

  it('keeps prod and local links independent', () => {
    cloudLink.saveLink(dir, 'prod', { botId: 1 })
    cloudLink.saveLink(dir, 'local', { botId: 2 })
    expect(cloudLink.loadLink(dir, 'prod').botId).toBe(1)
    expect(cloudLink.loadLink(dir, 'local').botId).toBe(2)
  })

  it('fails loud on invalid JSON in the link file', () => {
    fs.writeFileSync(path.join(dir, 'bot.json'), '{not json')
    expect(() => cloudLink.loadLinkIfPresent(dir, 'prod')).toThrow(/not valid JSON/)
  })

  it('rejects an unsafe legacy botId before it can target a rounded bot', () => {
    fs.writeFileSync(path.join(dir, 'bot.json'), '{"botId":9007199254740993,"workspaceId":7}')

    expect(() => cloudLink.loadLinkIfPresent(dir, 'prod')).toThrow(/bot\.json.*botId.*safe integer/i)
  })

  it('rejects an unsafe legacy workspaceId at the read boundary', () => {
    fs.writeFileSync(path.join(dir, 'bot.json'), '{"botId":42,"workspaceId":9007199254740993}')

    expect(() => cloudLink.loadLinkIfPresent(dir, 'prod')).toThrow(/bot\.json.*workspaceId.*safe integer/i)
  })
})
