import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractDeclaredCommands } from './declared-commands'

describe('extractDeclaredCommands', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-commands-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns an empty array when botruntime.commands.json is absent', () => {
    expect(extractDeclaredCommands(dir)).toEqual([])
  })

  it('reads botruntime.commands.json and normalizes slash-prefixed names', () => {
    fs.writeFileSync(
      path.join(dir, 'botruntime.commands.json'),
      JSON.stringify({ commands: [{ command: '/status', description: 'Статус дела' }] })
    )

    expect(extractDeclaredCommands(dir)).toEqual([{ command: 'status', description: 'Статус дела' }])
  })

  it('accepts a bare top-level array', () => {
    fs.writeFileSync(
      path.join(dir, 'botruntime.commands.json'),
      JSON.stringify([{ command: 'help', description: 'Show help' }])
    )

    expect(extractDeclaredCommands(dir)).toEqual([{ command: 'help', description: 'Show help' }])
  })

  it('fails loud on duplicate commands', () => {
    fs.writeFileSync(
      path.join(dir, 'botruntime.commands.json'),
      JSON.stringify([
        { command: 'status', description: 'Статус' },
        { command: '/status', description: 'Дубль' },
      ])
    )

    expect(() => extractDeclaredCommands(dir)).toThrow(/duplicate command "status"/)
  })

  it('fails loud on an invalid command name', () => {
    fs.writeFileSync(
      path.join(dir, 'botruntime.commands.json'),
      JSON.stringify([{ command: 'Not-Valid!', description: 'bad' }])
    )

    expect(() => extractDeclaredCommands(dir)).toThrow(/commands\[0\]\.command must match/)
  })

  it('fails loud on an empty description', () => {
    fs.writeFileSync(path.join(dir, 'botruntime.commands.json'), JSON.stringify([{ command: 'ok', description: '' }]))

    expect(() => extractDeclaredCommands(dir)).toThrow(/must be 1\.\.256 characters/)
  })

  it('fails loud on invalid JSON', () => {
    fs.writeFileSync(path.join(dir, 'botruntime.commands.json'), '{not json')

    expect(() => extractDeclaredCommands(dir)).toThrow(/invalid JSON/)
  })

  it('fails loud when the top level is neither an array nor {commands:[...]}', () => {
    fs.writeFileSync(path.join(dir, 'botruntime.commands.json'), JSON.stringify({ foo: 'bar' }))

    expect(() => extractDeclaredCommands(dir)).toThrow(/expected an array or/)
  })
})
