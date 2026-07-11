import yargs from 'yargs/yargs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommandTree } from './command-tree'
import { registerYargs } from './register-yargs'

describe('registerYargs', () => {
  afterEach(() => vi.restoreAllMocks())

  it('passes every value from a variadic positional array to the command', async () => {
    let tokens: unknown
    const commands = {
      traces: {
        description: 'test variadic filters',
        schema: {
          tokens: { type: 'string', array: true, positional: true, idx: 0 },
        },
        handler: async (argv: { tokens?: string[] }) => {
          tokens = argv.tokens
          return { exitCode: 0 }
        },
      },
    } as CommandTree
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const parser = yargs([]).exitProcess(false).strict()
    registerYargs(parser, commands)

    await parser.parseAsync(['traces', 'conversation=conv', 'error', 'since=1h'])

    expect(tokens).toEqual(['conversation=conv', 'error', 'since=1h'])
    expect(exit).toHaveBeenCalledWith(0)
  })
})
