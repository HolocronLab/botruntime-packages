import type { DefinitionTree } from './command-tree'
import * as config from './config'

export default {
  login: { description: 'Login to botruntime', schema: config.schemas.login },
  logout: { description: 'Logout of botruntime', schema: config.schemas.logout },
  bots: {
    description: 'Bot related commands',
    subcommands: {
      create: { description: 'Create new bot', schema: config.schemas.createBot, alias: 'new' },
      get: { description: 'Get bot', schema: config.schemas.getBot },
      delete: { description: 'Delete bot', schema: config.schemas.deleteBot, alias: 'rm' },
      list: { description: 'List bots', schema: config.schemas.listBots, alias: 'ls' },
    },
  },
  integrations: {
    description: 'Integration related commands',
    subcommands: {
      get: { description: 'Get integration', schema: config.schemas.getIntegration },
      delete: { description: 'Delete integration', schema: config.schemas.deleteIntegration, alias: 'rm' },
      list: { description: 'List integrations', schema: config.schemas.listIntegrations, alias: 'ls' },
      // Bespoke cloudapi wire (one channel per bot.json-linked bot), ported
      // from the (deleted) thin brt CLI's commands/integrations.ts. Added
      // alongside get/list/delete above under new, non-colliding names.
      install: {
        description: 'Install an integration on the bot.json-linked bot (bespoke cloudapi wire)',
        schema: config.schemas.cloudIntegrationInstall,
      },
      register: {
        description: "Register an installed integration's webhook (bespoke cloudapi wire)",
        schema: config.schemas.cloudIntegrationRegister,
      },
      publish: {
        description: 'Publish an integration definition + bundle to the catalog (bespoke cloudapi wire)',
        schema: config.schemas.cloudIntegrationPublish,
      },
    },
  },
  interfaces: {
    description: 'Interface related commands',
    subcommands: {
      get: { description: 'Get interface', schema: config.schemas.getInterface },
      delete: { description: 'Delete interface', schema: config.schemas.deleteInterface, alias: 'rm' },
      list: { description: 'List interfaces', schema: config.schemas.listInterfaces, alias: 'ls' },
    },
  },
  plugins: {
    description: 'Plugin related commands',
    subcommands: {
      get: { description: 'Get plugin', schema: config.schemas.getPlugin },
      delete: { description: 'Delete plugin', schema: config.schemas.deletePlugin, alias: 'rm' },
      list: { description: 'List plugins', schema: config.schemas.listPlugins, alias: 'ls' },
    },
  },
  init: { description: 'Initialize a new project', schema: config.schemas.init },
  generate: { description: 'Generate typings for intellisense', schema: config.schemas.generate, alias: 'gen' },
  bundle: { description: 'Bundle a botruntime project', schema: config.schemas.bundle },
  build: { description: 'Generate typings and bundle a botruntime project', schema: config.schemas.build },
  read: { description: 'Read and parse an integration definition', schema: config.schemas.read },
  serve: { description: 'Serve your project locally', schema: config.schemas.serve },
  deploy: { description: 'Deploy your project to the cloud', schema: config.schemas.deploy },
  add: {
    description: 'Install a package; could be an integration or an interface',
    schema: config.schemas.add,
    alias: ['i', 'install'],
  },
  remove: {
    description: "Remove a package from your project's dependencies",
    schema: config.schemas.remove,
    alias: 'rm',
  },
  dev: { description: 'Run your project in dev mode', schema: config.schemas.dev },
  lint: { description: 'EXPERIMENTAL: Lint an integration definition', schema: config.schemas.lint },
  chat: { description: 'EXPERIMENTAL: Chat with a bot directly from the CLI', schema: config.schemas.chat },
  profiles: {
    description: 'Commands for using CLI profiles',
    subcommands: {
      list: { description: 'List all available profiles', schema: config.schemas.listProfiles, alias: 'ls' },
      active: {
        description: 'Get the profile properties you are currently using',
        schema: config.schemas.activeProfile,
      },
      use: {
        description: 'Set the current profile',
        schema: config.schemas.useProfile,
      },
      get: {
        description: 'Get a specific profile by name',
        schema: config.schemas.getProfile,
      },
    },
  },
  link: {
    description: 'Link this project to an existing bot on the bespoke cloudapi wire (writes bot.json)',
    schema: config.schemas.cloudLink,
  },
  logs: {
    description: 'Fetch bot logs from the admin logs endpoint (bespoke cloudapi wire, machine key)',
    schema: config.schemas.logs,
  },
  config: {
    description: 'Per-bot config variables on the bespoke cloudapi wire (bot.json-linked bot)',
    subcommands: {
      set: { description: 'Set a config variable', schema: config.schemas.cloudConfigSet },
      list: { description: 'List config variables', schema: config.schemas.cloudConfigList, alias: 'ls' },
      rm: { description: 'Remove a config variable', schema: config.schemas.cloudConfigRm, alias: 'delete' },
    },
  },
  secret: {
    description: 'Per-bot secrets on the bespoke cloudapi wire (identical to config on the wire)',
    subcommands: {
      set: { description: 'Set a secret value', schema: config.schemas.cloudSecretSet },
    },
  },
} satisfies DefinitionTree
