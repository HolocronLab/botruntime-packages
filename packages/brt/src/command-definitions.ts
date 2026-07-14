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
      // Bespoke cloudapi wire (one channel per linked project target), ported
      // from the (deleted) thin brt CLI's commands/integrations.ts. Added
      // alongside get/list/delete above under new, non-colliding names.
      install: {
        description: 'Install an exact name@version integration on the selected project target',
        schema: config.schemas.cloudIntegrationInstall,
      },
      register: {
        description: "Register an installed integration's webhook on the selected target",
        schema: config.schemas.cloudIntegrationRegister,
      },
      publish: {
        description: 'Publish an integration definition and bundle to the workspace catalog',
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
    description: 'Install an integration, interface, or plugin in a classic project',
    schema: config.schemas.add,
    alias: ['i', 'install'],
  },
  remove: {
    description: "Remove a package from a classic project's bpDependencies",
    schema: config.schemas.remove,
    alias: 'rm',
  },
  dev: { description: 'Run your project in dev mode', schema: config.schemas.dev },
  check: { description: 'Validate an ADK project offline, including primitive discovery', schema: config.schemas.check },
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
    description: 'Link this project to an existing bot and write its canonical project link',
    schema: config.schemas.cloudLink,
  },
  logs: {
    description: 'Fetch runtime logs for the selected bot using the workspace profile',
    schema: config.schemas.logs,
  },
  traces: {
    description: 'Fetch privacy-safe runtime trace metadata for a conversation on the selected target',
    schema: config.schemas.traces,
  },
  conversations: {
    description: 'List and inspect privacy-safe conversations on the selected target',
    subcommands: {
      list: {
        description: 'List recent conversation metadata',
        schema: config.schemas.conversationsList,
        alias: 'ls',
      },
      show: {
        description: 'Show a privacy-safe conversation trace timeline',
        schema: config.schemas.conversationsShow,
      },
    },
  },
  eval: {
    description: 'Run and inspect privacy-safe hosted eval suites on the selected target',
    default: {
      description: 'Start a hosted eval suite and wait for its typed result',
      schema: config.schemas.evalRun,
    },
    subcommands: {
      run: {
        description: 'Start a hosted eval suite and wait for its typed result',
        schema: config.schemas.evalRun,
      },
      runs: {
        description: 'List or show hosted eval run history',
        schema: config.schemas.evalRuns,
      },
    },
  },
  config: {
    description: 'Manage per-bot config variables for the selected project target',
    subcommands: {
      set: { description: 'Set a config variable', schema: config.schemas.cloudConfigSet },
      list: { description: 'List config variables', schema: config.schemas.cloudConfigList, alias: 'ls' },
      rm: { description: 'Remove a config variable', schema: config.schemas.cloudConfigRm, alias: 'delete' },
    },
  },
  secret: {
    description: 'Manage per-bot secret values for the selected project target',
    subcommands: {
      set: { description: 'Set a secret value', schema: config.schemas.cloudSecretSet },
    },
  },
} satisfies DefinitionTree
