import { YargsArgv, YargsConfig, cleanupConfig, parseEnv } from '@holocronlab/botruntime-yargs-extra'
import type { Argv } from 'yargs'
import _ from 'lodash'
import * as tree from './command-tree'
import type * as typings from './typings'

export type YargsInstance = Argv

const parseArguments = <S extends typings.CommandSchema>(schema: S, argv: YargsArgv<S>): YargsConfig<S> => {
  const yargsEnv = parseEnv(schema, 'BRT')
  return cleanupConfig(schema, { ...argv, ...yargsEnv })
}

export const registerYargs = (yargz: YargsInstance, commands: tree.CommandTree) => {
  for (const cmdName in commands) {
    const command = commands[cmdName] as tree.CommandTreeNode

    if (tree.guards.command.isSubTree(command)) {
      yargz.command(cmdName, command.description ?? cmdName, (y) => {
        registerYargs(y, command.subcommands)
        if (command.default) registerLeaf(y, '$0', command.default)
        return command.default ? y : y.demandCommand(1)
      })
      continue
    }

    registerLeaf(yargz, cmdName, command)
  }
}

const registerLeaf = (yargz: YargsInstance, cmdName: string, command: tree.CommandTreeNode & typings.CommandLeaf) => {
  const { schema, description, alias } = command
  let aliases: string[]
  if (Array.isArray(alias)) {
    aliases = [cmdName, ...alias]
  } else if (alias) {
    aliases = [cmdName, alias]
  } else {
    aliases = [cmdName]
  }

  const options = Object.entries(schema)
  let positionals = options.filter(
    (value): value is [string, typings.CommandPositionalOption] => !!value[1].positional
  )

  let usage = aliases
  if (positionals.length) {
    positionals = _.sortBy(positionals, ([, option]) => option.idx)
    const positionalArgs = positionals.map(([optName, option]) => {
      const usageName = option.array ? `${optName}..` : optName
      return option.demandOption ? `<${usageName}>` : `[${usageName}]`
    })
    const positionalStr = positionalArgs.join(' ')
    usage = aliases.map((optAlias) => `${optAlias} ${positionalStr}`)
  }

  yargz.command(
    usage,
    description ?? cmdName,
    (y) => {
      for (const [key, option] of Object.entries(schema)) {
        if (option.positional) {
          y = y.positional(key, option)
        } else {
          y = y.option(key, option)
        }
      }
      return y
    },
    async (argv) => {
      const parsed = parseArguments(schema, argv)
      const { exitCode } = await command.handler({ ...parsed })
      process.exit(exitCode)
    }
  )
}
