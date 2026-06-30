#!/usr/bin/env bun
import 'dotenv/config'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import commandDefinitions from './command-definitions'
import commandImplementations from './command-implementations'
import * as tree from './command-tree'
import * as errors from './errors'
import { Logger } from './logger'
import { registerYargs } from './register-yargs'

const cli = yargs(hideBin(process.argv))

const logError = (thrown: unknown) => {
  const error = errors.BotpressCLIError.map(thrown)
  // genuine crashes only: print the full chain so headless callers (no -v) still get the reason.
  new Logger().error(errors.BotpressCLIError.fullStack(error))
}

const onError = (thrown: unknown) => {
  logError(thrown)
  process.exit(1)
}

const yargsFail = (msg?: string) => {
  // usage errors are bad input, not crashes; show the clean message and help, never a stack.
  if (msg !== undefined) {
    new Logger().error(`${msg}\n`)
  }
  cli.showHelp()
  process.exit(1)
}

process.on('uncaughtException', (thrown: unknown) => onError(thrown))
process.on('unhandledRejection', (thrown: unknown) => onError(thrown))

const commands = tree.zipTree(commandDefinitions, commandImplementations)

registerYargs(cli, commands)

void cli
  .version()
  .scriptName('brt')
  .demandCommand(1, "You didn't provide any command. Use the --help flag to see the list of available commands.")
  .recommendCommands()
  .strict()
  .help()
  .fail(yargsFail)
  .parse()
