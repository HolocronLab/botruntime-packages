import * as consts from './consts'
import { ProjectTemplates } from './project-templates'
import type { CommandOption, CommandSchema } from './typings'

// @holocronlab/botruntime-chat 0.5.5 does not export this union; it selects the transport internally.
type ServerEventsProtocol = 'sse' | 'websocket'

// command options

const port = {
  type: 'number',
  description: 'The port to use',
} satisfies CommandOption

const workDir = {
  type: 'string',
  description: 'The path to the project',
  default: consts.defaultWorkDir,
} satisfies CommandOption

const noBuild = {
  type: 'boolean',
  description: 'Skip the build step',
  default: false,
} satisfies CommandOption

const dryRun = {
  type: 'boolean',
  description: 'Ask the API not to perform the actual operation',
  default: false,
} as const satisfies CommandOption

const apiUrl = {
  type: 'string',
  description: 'The URL of the botruntime server',
} satisfies CommandOption

const token = {
  type: 'string',
  description: 'You Personal Access Token ',
} satisfies CommandOption

const workspaceId = {
  type: 'string',
  description: 'The Workspace Id to deploy to',
} satisfies CommandOption

const secrets = {
  type: 'string',
  description: 'Values for the bot or integration secrets',
  array: true,
  default: [],
} satisfies CommandOption

const botRef = {
  type: 'string',
  description: 'The bot ID. Bot Name is not supported.',
  demandOption: true,
  positional: true,
  idx: 0,
} satisfies CommandOption

const packageRef = {
  type: 'string',
  description:
    'The package ID or name with optional version. The package can be either an integration or an interface. Ex: teams, teams@0.2.0, llm@5.1.0',
  positional: true,
  idx: 0,
} satisfies CommandOption

const integrationRef = {
  ...packageRef,
  demandOption: true,
  description: 'The integration ID or name with optional version. Ex: teams or teams@0.2.0',
} satisfies CommandOption

const interfaceRef = {
  ...packageRef,
  demandOption: true,
  description: 'The interface ID or name and version. Ex: llm@5.1.0',
} satisfies CommandOption

const pluginRef = {
  ...packageRef,
  demandOption: true,
  description: 'The plugin ID or name and version. Ex: knowledge@0.0.1',
} satisfies CommandOption

const sourceMap = {
  type: 'boolean',
  description: 'Generate sourcemaps',
  default: false,
} satisfies CommandOption

const minify = {
  type: 'boolean',
  description: 'Minify the bundled code',
  default: true,
} satisfies CommandOption

const dev = {
  type: 'boolean',
  description: 'List only dev bots / dev integrations',
  default: false,
} satisfies CommandOption

const watch = {
  type: 'boolean',
  description: 'Watch project files and hot reload on changes',
  default: true,
} satisfies CommandOption

// bespoke cloudapi wire (brt config/secret/link) — see src/api/cloudapi-client.ts
// and src/cloud-project-link.ts. Kept separate from the Botpress-shaped `botRef` /
// `credentialsSchema` above: this addresses a bot via the bot.json/bot.local.json
// link file + a per-bot key in bots.json, not via --token/--workspace-id.

const cloudBotIdOverride = {
  type: 'string',
  description: 'The bot ID to target (overrides the linked bot.json/bot.local.json)',
} satisfies CommandOption

const cloudConfigVarName = {
  type: 'string',
  description: 'The config variable name (^[A-Za-z_][A-Za-z0-9_]*$)',
  positional: true,
  idx: 0,
} satisfies CommandOption

const cloudValueFile = {
  type: 'string',
  description: 'Read the value from this file instead of stdin (never pass secrets via argv)',
} satisfies CommandOption

const cloudLocal = {
  type: 'boolean',
  description: 'Use bot.local.json instead of bot.json for the bot link',
  default: false,
} satisfies CommandOption

// brt logs — GET /v1/admin/bots/{id}/logs (machine-key admin endpoint, NOT the
// per-bot key). timeStart is required server-side; `since` defaults client-side
// to now-1h so a bare `brt logs` works with no args (see logs-command.ts).

const cloudLogsSince = {
  type: 'string',
  description: 'Start of the time range to fetch logs from, RFC3339 (default: 1 hour ago)',
} satisfies CommandOption

const cloudLogsUntil = {
  type: 'string',
  description: 'End of the time range to fetch logs from, RFC3339',
} satisfies CommandOption

const cloudLogsLevel = {
  type: 'string',
  description: 'Filter logs by level',
} satisfies CommandOption

const cloudLogsGrep = {
  type: 'string',
  description: 'Filter logs whose message contains this substring',
} satisfies CommandOption

const cloudLogsConversationId = {
  type: 'string',
  description: 'Filter logs by conversation ID',
} satisfies CommandOption

const cloudLogsFollow = {
  type: 'boolean',
  description: 'Keep polling for new logs after draining the current time range',
  default: false,
  alias: 'f',
} satisfies CommandOption

const cloudLogsLimit = {
  type: 'number',
  description: 'Stop after printing this many log entries (client-side cap)',
} satisfies CommandOption

const cloudIntegrationRef = {
  type: 'string',
  description: 'The integration name with an optional version, e.g. telegram or telegram@0.0.1',
  positional: true,
  idx: 0,
  demandOption: true,
} satisfies CommandOption

const cloudWebhookId = {
  type: 'string',
  description: 'The webhookId returned by `brt integrations install`',
  positional: true,
  idx: 0,
  demandOption: true,
} satisfies CommandOption

const cloudConfigFile = {
  type: 'string',
  description: 'Read the integration config JSON from this file instead of stdin',
} satisfies CommandOption

const cloudConfigStdin = {
  type: 'boolean',
  description: 'Read the integration config JSON from stdin',
  default: false,
} satisfies CommandOption

// base schemas

const globalSchema = {
  verbose: {
    type: 'boolean',
    description: 'Enable verbose logging',
    alias: 'v',
    default: false,
  },
  confirm: {
    type: 'boolean',
    description: 'Confirm all prompts',
    alias: 'y',
    default: false,
  },
  json: {
    type: 'boolean',
    description: 'Prevent logging anything else than raw json in stdout. Useful for piping output to other tools',
    default: false,
  },
  botpressHome: {
    type: 'string',
    description: 'The path to the botruntime home directory',
    default: consts.defaultBotpressHome,
  },
  profile: {
    type: 'string',
    description: 'The CLI profile defined in the $BRT_BOTPRESS_HOME/profiles.json',
    alias: 'p',
  },
} satisfies CommandSchema

const projectSchema = {
  ...globalSchema,
  workDir,
} satisfies CommandSchema

const credentialsSchema = {
  apiUrl,
  workspaceId,
  token,
} satisfies CommandSchema

const secretsSchema = {
  secrets,
} satisfies CommandSchema

// command schemas

const generateSchema = {
  ...projectSchema,
} satisfies CommandSchema

const bundleSchema = {
  ...projectSchema,
  sourceMap,
  minify,
} satisfies CommandSchema

const buildSchema = {
  ...projectSchema,
  sourceMap,
  minify,
} satisfies CommandSchema

const readSchema = {
  ...projectSchema,
} satisfies CommandSchema

const serveSchema = {
  ...projectSchema,
  ...secretsSchema,
  port,
} satisfies CommandSchema

const deploySchema = {
  ...projectSchema,
  ...credentialsSchema,
  ...secretsSchema,
  botId: {
    type: 'string',
    description:
      'The bot ID to deploy (Botpress-shaped deploy), or an override for the linked bot.json/bot.local.json botId (--adk deploy)',
  },
  // --adk gates the bespoke-cloudapi-wire ADK-bundle deploy path (ported from
  // the (deleted) thin brt CLI's commands/deploy.ts), added ALONGSIDE the
  // Botpress-shaped deploy above: it targets a bot.json/bot.local.json-linked
  // bot via CloudapiClient (PUT /v1/admin/bots/{id}) instead of the
  // @holocronlab/botruntime-client ApiClient. See deploy-command.ts.
  adk: {
    type: 'boolean',
    description: 'Deploy via the bespoke cloudapi ADK-bundle wire (bot.json-linked bot) instead of the default deploy',
    default: false,
  },
  local: cloudLocal,
  name: { type: 'string', description: 'Bot name (--adk deploy only; defaults to the bot ID)' },
  noBuild,
  dryRun,
  createNewBot: {
    type: 'boolean',
    description: 'Create a new bot when deploying. Only used when deploying a bot',
  },
  sourceMap,
  minify,
  visibility: {
    type: 'string',
    choices: ['public', 'private', 'unlisted'] as const,
    description:
      'The visibility of the project. By default, projects are always private. Unlisted visibility is only supported for integrations and plugins.',
    default: 'private',
  },
  public: {
    type: 'boolean',
    description: 'DEPRECATED: Please use "--visibility public" instead.',
    default: false,
    deprecated: true,
  } satisfies CommandOption,
  allowDeprecated: {
    type: 'boolean',
    description: 'Allow deprecated features in the project',
    default: false,
  },
  url: {
    type: 'string',
    description: 'Custom URL for the integration. Only used when deploying an integration',
  },
  bypassBreakingChangeDetection: {
    type: 'boolean',
    hidden: true,
    default: false,
  },
  // Deliberately SEPARATE from -y/--confirm: a destructive table-sync change
  // (column remove/modify, orphaned-table delete — see adk-table-sync.ts) must
  // not be satisfiable by the blanket confirm-everything flag, so it gets its
  // own explicit opt-in.
  allowDestructiveTableChanges: {
    type: 'boolean',
    description: 'Allow destructive table schema changes (column removal/retype, orphaned table delete) without an interactive prompt',
    default: false,
  },
} as const satisfies CommandSchema

const devSchema = {
  ...projectSchema,
  ...credentialsSchema,
  ...secretsSchema,
  sourceMap,
  minify,
  watch,
  port,
  tunnelUrl: {
    type: 'string',
    description: 'The tunnel HTTP URL to use',
    default: consts.defaultTunnelUrl,
  },
  tunnelId: {
    type: 'string',
    description: 'The tunnel ID to use. The ID will be generated if not specified',
  },
  noSecretCaching: {
    type: 'boolean',
    description: 'Do not save the secrets locally',
    default: false,
    alias: 'nsc',
  },
  // --adk gates the ADK agent dev loop (bespoke cloudapi wire), added ALONGSIDE
  // the classic tunnel/worker dev server above: watch -> force rebuild -> `brt
  // deploy --adk` -> the runtime-host supervisor hot-swaps the running child on
  // its next poll (see dev-command.ts _runAdkDev). Auto-detected when the
  // project directory contains agent.config.ts, so this flag mostly matters for
  // scripts that want to be explicit or force the branch.
  adk: {
    type: 'boolean',
    description: 'Run the ADK agent dev loop (bespoke cloudapi wire) instead of the classic tunnel/worker dev server',
    default: false,
  },
  // --local threads through to the underlying `brt deploy --adk` so the dev loop
  // targets the bot.local.json link (local runtime-host + cloudapi stack) rather
  // than bot.json. Only meaningful with --adk; ignored by the classic dev path.
  local: cloudLocal,
} satisfies CommandSchema

const addSchema = {
  ...globalSchema,
  ...credentialsSchema,
  packageRef,
  installPath: {
    type: 'string',
    description: 'The path where to install the package',
    default: consts.defaultInstallPath,
  },
  useDev: {
    type: 'boolean',
    description: 'If a dev version of the package is found, use it',
    default: false,
  },
  alias: {
    type: 'string',
    description: 'The alias to install the package with',
  },
} satisfies CommandSchema

const removeSchema = {
  ...globalSchema,
  ...credentialsSchema,
  workDir,
  alias: {
    idx: 0,
    positional: true,
    type: 'string',
    description: 'The alias of the package to uninstall',
  },
} satisfies CommandSchema

const loginSchema = {
  ...globalSchema,
  token,
  workspaceId,
  apiUrl: { ...apiUrl, default: consts.defaultBotpressApiUrl },
  // Device Authorization Grant (RFC 8628): `brt login` opens a browser link and
  // the server hands back a PAT once you approve — no manual token paste. On by
  // default; `--no-device` falls back to the interactive paste prompt, and
  // `--token <PAT>` bypasses both (used by CI / scripts).
  device: {
    type: 'boolean',
    description:
      'Authenticate by opening a browser link (device authorization) instead of pasting a token. Use --no-device to paste a PAT interactively.',
    default: true,
  },
} satisfies CommandSchema

const logoutSchema = {
  ...globalSchema,
} satisfies CommandSchema

const createBotSchema = {
  ...globalSchema,
  ...credentialsSchema,
  name: { type: 'string', description: 'The name of the bot to create' },
  ifNotExists: {
    type: 'boolean',
    description: 'Do not create if a bot with the same name already exists',
    default: false,
  },
} satisfies CommandSchema

const getBotSchema = {
  ...globalSchema,
  ...credentialsSchema,
  botRef,
} satisfies CommandSchema

const deleteBotSchema = {
  ...globalSchema,
  ...credentialsSchema,
  botRef,
} satisfies CommandSchema

const listBotsSchema = {
  ...globalSchema,
  ...credentialsSchema,
  dev,
} satisfies CommandSchema

const getIntegrationSchema = {
  ...globalSchema,
  ...credentialsSchema,
  integrationRef,
} satisfies CommandSchema

const listIntegrationsSchema = {
  ...globalSchema,
  ...credentialsSchema,
  name: { type: 'string', description: 'The name filter when listing integrations' },
  versionNumber: { type: 'string', description: 'The version filter when listing integrations' },
  owned: { type: 'boolean', description: 'List only owned integrations' },
  public: { type: 'boolean', description: 'List only public integrations' },
  limit: { type: 'number', description: 'Limit the number of integrations returned' },
  dev,
} satisfies CommandSchema

const deleteIntegrationSchema = {
  ...globalSchema,
  ...credentialsSchema,
  integrationRef,
} satisfies CommandSchema

const getInterfaceSchema = {
  ...globalSchema,
  ...credentialsSchema,
  interfaceRef,
} satisfies CommandSchema

const listInterfacesSchema = {
  ...globalSchema,
  ...credentialsSchema,
} satisfies CommandSchema

const deleteInterfaceSchema = {
  ...globalSchema,
  ...credentialsSchema,
  interfaceRef,
} satisfies CommandSchema

const getPluginSchema = {
  ...globalSchema,
  ...credentialsSchema,
  pluginRef,
} satisfies CommandSchema

const listPluginsSchema = {
  ...globalSchema,
  ...credentialsSchema,
  name: { type: 'string', description: 'The name filter when listing plugins' },
  versionNumber: { type: 'string', description: 'The version filter when listing plugins' },
} satisfies CommandSchema

const deletePluginSchema = {
  ...globalSchema,
  ...credentialsSchema,
  pluginRef,
} satisfies CommandSchema

const initSchema = {
  ...globalSchema,
  workDir,
  type: { type: 'string', choices: ['bot', 'integration', 'plugin'] as const },
  template: {
    type: 'string',
    choices: ProjectTemplates.getAllChoices(),
    description: 'The template to use',
  },
  name: { type: 'string', description: 'The name of the project' },
} satisfies CommandSchema

const lintSchema = {
  ...projectSchema,
} satisfies CommandSchema

const chatSchema = {
  ...globalSchema,
  ...credentialsSchema,
  chatApiUrl: {
    type: 'string',
    description: 'The URL of the chat server',
  },
  botId: {
    type: 'string',
    positional: true,
    idx: 0,
    description: 'The bot ID to chat with',
  },
  protocol: {
    choices: ['sse', 'websocket'] satisfies ReadonlyArray<ServerEventsProtocol>,
    default: 'sse' as const,
    description: 'The protocol to use for long lived connections',
  },
} satisfies CommandSchema

const listProfilesSchema = {
  ...globalSchema,
  displayToken: {
    type: 'boolean',
    description: 'Display the token in each of the brt profiles',
    default: false,
  },
} satisfies CommandSchema

const activeProfileSchema = {
  ...globalSchema,
  displayToken: {
    type: 'boolean',
    description: 'Display the token in the brt profile',
    default: false,
  },
} satisfies CommandSchema

const useProfileSchema = {
  ...globalSchema,
  profileToUse: {
    type: 'string',
    description: 'The CLI profile defined in the $BRT_BOTPRESS_HOME/profiles.json',
    positional: true,
    idx: 0,
  },
} satisfies CommandSchema

const getProfileSchema = {
  ...globalSchema,
  profileToGet: {
    type: 'string',
    description: 'The CLI profile defined in the $BRT_BOTPRESS_HOME/profiles.json',
    positional: true,
    idx: 0,
  },
  displayToken: {
    type: 'boolean',
    description: 'Display the token in the brt profile',
    default: false,
  },
} satisfies CommandSchema

const cloudProjectSchema = {
  ...projectSchema,
  apiUrl,
  botId: cloudBotIdOverride,
  local: cloudLocal,
} satisfies CommandSchema

const cloudConfigSetSchema = {
  ...cloudProjectSchema,
  name: { ...cloudConfigVarName, demandOption: true },
  valueFile: cloudValueFile,
} satisfies CommandSchema

const cloudConfigListSchema = {
  ...cloudProjectSchema,
} satisfies CommandSchema

const cloudConfigRmSchema = {
  ...cloudProjectSchema,
  name: { ...cloudConfigVarName, demandOption: true },
} satisfies CommandSchema

const cloudSecretSetSchema = {
  ...cloudProjectSchema,
  name: { ...cloudConfigVarName, demandOption: true },
  valueFile: cloudValueFile,
} satisfies CommandSchema

const cloudLinkSchema = {
  ...cloudProjectSchema,
  botId: {
    ...cloudBotIdOverride,
    demandOption: true,
    description: 'The bot ID to link',
  },
  key: {
    type: 'string',
    description: 'The per-bot API key (prefer --key-stdin; a raw argv value can leak into shell history)',
  },
  keyStdin: {
    type: 'boolean',
    description: 'Read the per-bot API key from stdin',
    default: false,
  },
  workspaceId,
} satisfies CommandSchema

// brt logs [--bot-id] [--since] [--until] [--level] [--grep] [--conversation-id]
// [--follow] [--limit] — GET /v1/admin/bots/{id}/logs on the bespoke cloudapi
// wire, authenticated with the MACHINE key (profile.token), not the per-bot key
// (see cloud-command.ts machineCloudapiClient vs botCloudapiClient). Botid
// resolution mirrors the other cloud-project commands: --bot-id overrides the
// linked bot.json/bot.local.json.
const logsSchema = {
  ...cloudProjectSchema,
  since: cloudLogsSince,
  until: cloudLogsUntil,
  level: cloudLogsLevel,
  grep: cloudLogsGrep,
  conversationId: cloudLogsConversationId,
  follow: cloudLogsFollow,
  limit: cloudLogsLimit,
} satisfies CommandSchema

// brt integrations install|register|publish — the bespoke-cloudapi-wire
// integration channel commands, ported from the (deleted) thin brt CLI's
// commands/integrations.ts. Added ALONGSIDE the existing (Botpress catalog)
// `integrations get/list/delete` above; `install`/`register`/`publish` are
// new subcommand names under the same `brt integrations` tree node, so there
// is no collision.

const cloudIntegrationInstallSchema = {
  ...cloudProjectSchema,
  ref: cloudIntegrationRef,
  alias: { type: 'string', description: 'Alias for this integration installation (defaults to the integration name)' },
  configFile: cloudConfigFile,
  configStdin: cloudConfigStdin,
} satisfies CommandSchema

const cloudIntegrationRegisterSchema = {
  ...cloudProjectSchema,
  webhookId: cloudWebhookId,
} satisfies CommandSchema

const cloudIntegrationPublishSchema = {
  ...projectSchema,
  apiUrl,
  name: {
    type: 'string',
    description: 'Integration name (skips reading integration.definition.ts; requires --versionNumber too)',
  },
  // Named versionNumber, not version: yargs reserves `--version` for its own
  // CLI-version flag (see listIntegrationsSchema/listPluginsSchema for the
  // same workaround elsewhere in this file).
  versionNumber: {
    type: 'string',
    description: 'Integration version (skips reading integration.definition.ts; requires --name too)',
  },
  configSchemaFile: {
    type: 'string',
    description: 'Read the catalog config schema (the {fields:{...}} shape) from this JSON file',
  },
  noBundle: {
    type: 'boolean',
    description: 'Publish/update the integration definition only; skip building and uploading the bundle',
    default: false,
  },
  noBuild,
} satisfies CommandSchema

// exports

export const schemas = {
  global: globalSchema,
  project: projectSchema,
  credentials: credentialsSchema,
  secrets: secretsSchema,
  login: loginSchema,
  logout: logoutSchema,
  createBot: createBotSchema,
  getBot: getBotSchema,
  deleteBot: deleteBotSchema,
  listBots: listBotsSchema,
  getIntegration: getIntegrationSchema,
  listIntegrations: listIntegrationsSchema,
  deleteIntegration: deleteIntegrationSchema,
  getInterface: getInterfaceSchema,
  listInterfaces: listInterfacesSchema,
  deleteInterface: deleteInterfaceSchema,
  getPlugin: getPluginSchema,
  listPlugins: listPluginsSchema,
  deletePlugin: deletePluginSchema,
  init: initSchema,
  generate: generateSchema,
  bundle: bundleSchema,
  build: buildSchema,
  read: readSchema,
  serve: serveSchema,
  deploy: deploySchema,
  add: addSchema,
  remove: removeSchema,
  dev: devSchema,
  lint: lintSchema,
  chat: chatSchema,
  listProfiles: listProfilesSchema,
  activeProfile: activeProfileSchema,
  useProfile: useProfileSchema,
  getProfile: getProfileSchema,
  cloudProject: cloudProjectSchema,
  cloudConfigSet: cloudConfigSetSchema,
  cloudConfigList: cloudConfigListSchema,
  cloudConfigRm: cloudConfigRmSchema,
  cloudSecretSet: cloudSecretSetSchema,
  cloudLink: cloudLinkSchema,
  logs: logsSchema,
  cloudIntegrationInstall: cloudIntegrationInstallSchema,
  cloudIntegrationRegister: cloudIntegrationRegisterSchema,
  cloudIntegrationPublish: cloudIntegrationPublishSchema,
} as const
