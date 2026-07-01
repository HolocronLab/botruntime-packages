/**
 * Map of resource-id prefixes (e.g. `bot_`, `kb_`) to their object type name,
 * plus the `FileId` branded id type — a faithful reimplementation of the
 * `prefixes.ts` module exported by `@bpinternal/const`.
 *
 * Upstream derives one branded template-literal id type per object type
 * (e.g. `BotId`, `ConversationId`, `FileId`, ...) from `objectToPrefixMap`
 * via a generic `Ids` mapped type: `Ids[\`${Capitalize<Object>}Id\`]` is
 * `` `${prefix}_${string}` ``. brt only ever imports `FileId`, so only that
 * single derived type is exposed here — the generic derivation machinery
 * itself is reproduced (rather than hardcoding the literal) so `FileId`'s
 * shape stays byte-for-byte identical to upstream.
 */
export const prefixToObjectMap = {
  accnt: 'account',
  accntpf: 'accountPreference',
  action: 'action',
  activty: 'activity',
  anlytic: 'analytics',
  audit: 'audit',
  bak: 'botApiKey',
  bot: 'bot',
  card: 'card',
  cfg: 'configuration',
  channel: 'channel',
  conv: 'conversation',
  devbot: 'devBot',
  devint: 'devIntegration',
  evt: 'event',
  file: 'file',
  flow: 'flow',
  iak: 'integrationApiKey',
  int: 'integration',
  iface: 'interface',
  ifver: 'interfaceVersion',
  intver: 'integrationVersion',
  iss: 'issue',
  issevt: 'issueEvent',
  kb: 'knowledgeBase',
  limit: 'limit',
  media: 'media',
  msg: 'message',
  node: 'node',
  notif: 'notification',
  pat: 'personalAccessToken',
  plugin: 'plugin',
  plugver: 'pluginVersion',
  quota: 'quota',
  recevt: 'recurringEvent',
  report: 'report',
  sandbox: 'sandbox',
  schema: 'schema',
  script: 'script',
  state: 'state',
  table: 'table',
  tag: 'tag',
  task: 'task',
  archrg: 'autoRechargeSetting',
  archtx: 'autoRechargeTransaction',
  crgrant: 'creditGrant',
  job: 'job',
  pcrgrant: 'pendingCreditGrant',
  promo: 'promoCode',
  smgevt: 'smaugEvent',
  usage: 'usage',
  user: 'user',
  webhook: 'webhook',
  wkspace: 'workspace',
  wksadd: 'workspaceAddon',
  wksqtaadd: 'workspaceQuotaAddition',
  wksplan: 'workspacePlan',
  wrkflow: 'workflow',
  wkspacepf: 'workspacePreference',
  trial: 'trial',
  evlrun: 'evalRun',
  evlent: 'evalEntry',
  evlres: 'evalResult',
} as const

type Reverser<T extends Record<PropertyKey, PropertyKey>> = {
  [P in keyof T as T[P]]: P
}

const objectToPrefixMap = Object.fromEntries(
  Object.entries(prefixToObjectMap).map(([prefix, object]) => [object, prefix]),
) as Reverser<typeof prefixToObjectMap>

type Objects = keyof typeof objectToPrefixMap

type Ids = {
  [Id in Objects as `${Capitalize<Id>}Id`]: `${(typeof objectToPrefixMap)[Id]}_${string}`
}

export type FileId = Ids['FileId']
