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

  it('runs a subtree default leaf while preserving explicit subcommands', async () => {
    const seen: string[] = []
    const commands = {
      eval: {
        description: 'evals',
        default: {
          schema: { name: { type: 'string', positional: true, idx: 0 } },
          handler: async (argv: { name?: string }) => {
            seen.push(`default:${argv.name ?? 'all'}`)
            return { exitCode: 0 }
          },
        },
        subcommands: {
          runs: {
            schema: {},
            handler: async () => {
              seen.push('runs')
              return { exitCode: 0 }
            },
          },
        },
      },
    } as CommandTree
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const parser = yargs([]).exitProcess(false).strict()
    registerYargs(parser, commands)

    await parser.parseAsync(['eval', 'greeting'])
    await parser.parseAsync(['eval', 'runs'])

    expect(seen).toEqual(['default:greeting', 'runs'])
    expect(exit).toHaveBeenCalledTimes(2)
  })
})
