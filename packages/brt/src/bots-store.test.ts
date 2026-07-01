import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as botsStore from './bots-store'

describe('bots-store', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-bots-store-'))
    filePath = path.join(dir, 'bots.json')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns an empty store when the file does not exist', () => {
    expect(botsStore.readBotsStore(filePath)).toEqual({})
  })

  it('round-trips creds through write/read, namespaced by profile', () => {
    const store = botsStore.readBotsStore(filePath)
    botsStore.setBotCreds(store, 'default', '42', { apiKey: 'key-1' })
    botsStore.setBotCreds(store, 'staging', '42', { apiKey: 'key-2' })
    botsStore.writeBotsStore(filePath, store)

    const reread = botsStore.readBotsStore(filePath)
    expect(botsStore.getBotCreds(reread, 'default', '42')).toEqual({ apiKey: 'key-1' })
    expect(botsStore.getBotCreds(reread, 'staging', '42')).toEqual({ apiKey: 'key-2' })
    expect(botsStore.getBotCreds(reread, 'default', '999')).toBeUndefined()
  })

  it('writes the file with 0600 permissions', () => {
    botsStore.writeBotsStore(filePath, {})
    const mode = fs.statSync(filePath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('creates missing parent directories', () => {
    const nested = path.join(dir, 'nested', 'bots.json')
    botsStore.writeBotsStore(nested, { default: { '1': { apiKey: 'k' } } })
    expect(botsStore.readBotsStore(nested)).toEqual({ default: { '1': { apiKey: 'k' } } })
  })

  it('fails loud on invalid JSON rather than silently returning an empty store', () => {
    fs.writeFileSync(filePath, '{not json')
    expect(() => botsStore.readBotsStore(filePath)).toThrow(/not valid JSON/)
  })

  it('setBotCreds merges rather than replacing existing fields for the same bot', () => {
    const store: botsStore.BotsStore = { default: { '42': { apiKey: 'old' } } }
    botsStore.setBotCreds(store, 'default', '42', { apiKey: 'new' })
    expect(store.default!['42']).toEqual({ apiKey: 'new' })
  })

  it('removeProfileBotCreds drops every bot key under that profile', () => {
    const store: botsStore.BotsStore = { default: { '1': { apiKey: 'a' }, '2': { apiKey: 'b' } } }
    botsStore.removeProfileBotCreds(store, 'default')
    expect(store.default).toBeUndefined()
  })
})
