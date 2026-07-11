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
  description: 'Ask the API not to perform the actual operation (classic deploy only; --adk rejects this flag)',
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
    'The package ID or name with optional version for classic-project bpDependencies. It can be an integration, interface, or plugin. Ex: teams@0.2.0, llm@5.1.0',
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

const deployWatch = {
  type: 'boolean',
  description: 'Continuously rebuild and deploy an ADK agent when source files change (requires --adk)',
  default: false,
} satisfies CommandOption

// Cloud-backed bot commands (brt config/secret/link) — see
// src/api/cloudapi-client.ts and src/cloud-project-link.ts. Agent projects use
// agent.json/agent.local.json as canonical coordinates; classic projects use
// bot.json/bot.local.json. Production mutations authenticate with the per-bot
// key in bots.json rather than --token/--workspace-id.

const cloudBotIdOverride = {
  type: 'string',
  description: 'The bot ID to target (overrides the canonical project link)',
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
  description: 'Use the local project link (agent.local.json for agent projects; bot.local.json for classic)',
  default: false,
} satisfies CommandOption

const cloudDevTarget = {
  type: 'boolean',
  description:
    'Target the cached dev bot through the workspace PAT (orthogonal to --local, which selects the stack/link)',
  default: false,
} satisfies CommandOption

// brt logs — GET /v1/admin/bots/{id}/logs with the selected workspace/profile
// PAT, not the per-bot key. timeStart is required server-side; `since` defaults
// client-side to now-1h so a bare `brt logs` works (see logs-command.ts).

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

const cloudTracesConversationId = {
  type: 'string',
  description: 'Conversation correlation ID (required unless provided as conversation=<id>)',
} satisfies CommandOption

const cloudTracesLimit = {
  type: 'number',
  description: 'Maximum trace rows to return (1-10000)',
} satisfies CommandOption

const cloudTracesNextToken = {
  type: 'string',
  description: 'Resume listing from this server-issued pagination cursor',
} satisfies CommandOption

const cloudTracesTokens = {
  type: 'string',
  description: 'Botpress-compatible filters: error, conversation=, workflow=, action=, trace=, since=, until=, limit=',
  array: true,
  positional: true,
  idx: 0,
} satisfies CommandOption

const cloudTracesStatus = {
  type: 'string',
  description: 'Filter by typed status: unset, ok, or error',
} satisfies CommandOption

const cloudTracesError = {
  type: 'boolean',
  description: 'Filter effective errors; use --no-error for non-error rows',
} satisfies CommandOption

const cloudTracesSource = {
  type: 'string',
  description: 'Filter by privacy-safe trace source',
} satisfies CommandOption

const cloudTracesName = {
  type: 'string',
  description: 'Filter by typed trace span name',
} satisfies CommandOption

const cloudTracesWorkflow = {
  type: 'string',
  description: 'Filter rows by workflow name',
} satisfies CommandOption

const cloudTracesAction = {
  type: 'string',
  description: 'Filter rows by action or tool name',
} satisfies CommandOption

const cloudTracesTraceId = {
  type: 'string',
  description: 'Drill into a normalized 32-hex trace ID',
} satisfies CommandOption

const cloudTracesSince = {
  type: 'string',
  description: 'Inclusive lower bound as RFC3339 or a relative duration such as 30s, 5m, or 1h',
} satisfies CommandOption

const cloudTracesUntil = {
  type: 'string',
  description: 'Inclusive upper bound as RFC3339 or a relative duration such as 30s, 5m, or 1h',
} satisfies CommandOption

const cloudConversationsTokens = {
  type: 'string',
  description: 'Botpress-compatible filters: limit=<n>, since=<duration>',
  array: true,
  positional: true,
  idx: 0,
} satisfies CommandOption

const cloudConversationsLimit = {
  type: 'number',
  description: 'Maximum conversations to return (1-10000; default: 20)',
} satisfies CommandOption

const cloudConversationsSince = {
  type: 'string',
  description: 'Only conversations updated since RFC3339 or a relative duration such as 30s, 5m, 1h, or 2d',
} satisfies CommandOption

const cloudConversationsNextToken = {
  type: 'string',
  description: 'Resume listing from this server-issued positive decimal cursor',
} satisfies CommandOption

const cloudConversationId = {
  type: 'string',
  description: 'Conversation ID to inspect',
  positional: true,
  idx: 0,
  demandOption: true,
} satisfies CommandOption

const cloudIntegrationRef = {
  type: 'string',
  description:
    'Integration reference in name@version form; version is required and must be an exact SemVer (for example telegram@1.1.3)',
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
  token: {
    ...token,
    description: 'Personal Access Token for classic deploy; --adk rejects this flag and uses the selected profile',
  },
  workspaceId: {
    ...workspaceId,
    description: 'Workspace for classic deploy; --adk rejects this flag and uses the selected profile',
  },
  botId: {
    type: 'string',
    description:
      'The bot ID to deploy, or an override for the canonical project link (brt deploy --adk)',
  },
  // --adk gates the ADK-bundle deploy path alongside classic deploy. Agent
  // projects resolve agent.json/agent.local.json through CloudapiClient
  // (PUT /v1/admin/bots/{id}); see deploy-command.ts.
  adk: {
    type: 'boolean',
    description: 'Generate, bundle, and deploy an agent project to its canonical target',
    default: false,
  },
  watch: deployWatch,
  local: {
    ...cloudLocal,
    description: 'For --adk, use the strict local agent link; classic deploy does not use this flag',
  },
  name: { type: 'string', description: 'Bot name (brt deploy --adk only; defaults to the bot ID)' },
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
  check: {
    type: 'boolean',
    description:
      'Check a previously migrated dev target and dependency snapshot without starting the dev server',
    default: false,
  },
  // One-release compatibility guard only. Dev has exactly one successful
  // semantic: the dev-bot/tunnel path. The implementation rejects this flag
  // before build or network work and points callers to deploy --adk --watch.
  adk: {
    type: 'boolean',
    description: 'Deprecated: use brt deploy --adk --watch for the cloud redeploy loop',
    default: false,
    hidden: true,
    deprecated: true,
  },
  // Also selects the local link during `brt dev --check`; legacy
  // `brt dev --adk --local` is still stopped by the --adk migration guard.
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
  dev: cloudDevTarget,
  name: { ...cloudConfigVarName, demandOption: true },
  valueFile: cloudValueFile,
} satisfies CommandSchema

const cloudConfigListSchema = {
  ...cloudProjectSchema,
  dev: cloudDevTarget,
} satisfies CommandSchema

const cloudConfigRmSchema = {
  ...cloudProjectSchema,
  dev: cloudDevTarget,
  name: { ...cloudConfigVarName, demandOption: true },
} satisfies CommandSchema

const cloudSecretSetSchema = {
  ...cloudProjectSchema,
  dev: cloudDevTarget,
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
  workspaceId: {
    ...workspaceId,
    description: 'The workspace ID to store in the canonical project link',
  },
} satisfies CommandSchema

// brt logs [--bot-id] [--since] [--until] [--level] [--grep] [--conversation-id]
// [--follow] [--limit] — GET /v1/admin/bots/{id}/logs, authenticated with the
// selected workspace/profile PAT rather than the per-bot key. Bot ID resolution
// mirrors other cloud-project commands: --bot-id overrides the canonical link.
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

// brt traces [tokens...] --conversation-id <id> [--dev] [--limit] [--next-token]
// Production reads the canonical workspace/bot human route. --dev resolves an
// attested opaque runtime target and uses the bot-scoped trace reader instead.
const tracesSchema = {
  ...cloudProjectSchema,
  tokens: cloudTracesTokens,
  dev: cloudDevTarget,
  conversationId: cloudTracesConversationId,
  status: cloudTracesStatus,
  error: cloudTracesError,
  source: cloudTracesSource,
  name: cloudTracesName,
  workflow: cloudTracesWorkflow,
  action: cloudTracesAction,
  traceId: cloudTracesTraceId,
  since: cloudTracesSince,
  until: cloudTracesUntil,
  limit: cloudTracesLimit,
  nextToken: cloudTracesNextToken,
} satisfies CommandSchema

// brt conversations list|show — cloud metadata-only conversation diagnostics.
// List projects out backend tags; show builds a privacy-safe timeline only from
// the typed trace projection and deliberately has no include-llm bypass.
const conversationsListSchema = {
  ...cloudProjectSchema,
  tokens: cloudConversationsTokens,
  dev: cloudDevTarget,
  since: cloudConversationsSince,
  limit: cloudConversationsLimit,
  nextToken: cloudConversationsNextToken,
} satisfies CommandSchema

const conversationsShowSchema = {
  ...cloudProjectSchema,
  conversationId: cloudConversationId,
  dev: cloudDevTarget,
} satisfies CommandSchema

// brt integrations install|register|publish — the bespoke-cloudapi-wire
// integration channel commands, ported from the (deleted) thin brt CLI's
// commands/integrations.ts. Added ALONGSIDE the existing (Botpress catalog)
// `integrations get/list/delete` above; `install`/`register`/`publish` are
// new subcommand names under the same `brt integrations` tree node, so there
// is no collision.

const cloudIntegrationInstallSchema = {
  ...cloudProjectSchema,
  dev: cloudDevTarget,
  ref: cloudIntegrationRef,
  alias: { type: 'string', description: 'Alias for this integration installation (defaults to the integration name)' },
  configFile: cloudConfigFile,
  configStdin: cloudConfigStdin,
} satisfies CommandSchema

const cloudIntegrationRegisterSchema = {
  ...cloudProjectSchema,
  dev: cloudDevTarget,
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
  traces: tracesSchema,
  conversationsList: conversationsListSchema,
  conversationsShow: conversationsShowSchema,
  cloudIntegrationInstall: cloudIntegrationInstallSchema,
  cloudIntegrationRegister: cloudIntegrationRegisterSchema,
  cloudIntegrationPublish: cloudIntegrationPublishSchema,
} as const
