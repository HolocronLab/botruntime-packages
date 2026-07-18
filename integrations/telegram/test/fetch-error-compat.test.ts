import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Telegram } from 'telegraf'

describe('Telegram transport error fidelity', () => {
  it('builds Telegraf with the real Error-based node-fetch transport patch', () => {
    const source = readFileSync(resolve(import.meta.dir, '../node_modules/node-fetch/lib/index.js'), 'utf8')
    expect(source).toContain('class FetchError extends Error')
    expect(source).not.toContain('function FetchError(message, type, systemError)')
  })

  it('keeps a network failure as a real Error with an inspectable stack', async () => {
    let thrown: unknown
    try {
      await new Telegram('123:TEST', { apiRoot: 'http://127.0.0.1:1' }).sendMessage(1, 'probe')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).stack).not.toContain('First argument must be an Error object')
    expect((thrown as Error).message).not.toBe('First argument must be an Error object')
  })
})
