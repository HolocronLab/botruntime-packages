import * as errors from '../errors'

// CloudapiClient — the bespoke half of brt: a thin, dependency-free typed client
// over cloudapi's /v1/admin + /internal/* surface. This is NOT the Botpress-shaped
// surface wrapped by ../api/client.ts (ApiClient / @holocronlab/botruntime-client) —
// it is a separate, contract-identical port of the (now-deleted) thin brt CLI's
// client.ts, kept verbatim on the wire so already-provisioned bots keep working.
//
// Auth: `authorization: Bearer <apiKey>` (resolved to a BotRef server-side).
// x-bot-id addresses chat/state/tables/files; admin scope comes from the key.
// /internal/* additionally needs x-internal-token when the server sets one.
//
// No Botpress-scoped npm dependency, no axios: native fetch + AbortController,
// so this client can be constructed and used without pulling in the Botpress SDK.

export interface ProvisionResponse {
  botId: number
  apiKey: string
  workspaceId: number
  name?: string
}

export interface BundleResponse {
  code: string
  versionId: number
}

export interface InstallResponse {
  installationId: number
  webhookId: string
  webhookSecret: string
}

export interface RegisterResponse {
  ok: boolean
  webhookId: string
  webhookUrl: string
}

export interface ConfigVar {
  name: string
  updatedAt?: string
}

export interface IntegrationDefinitionEntity {
  id: number
  workspaceId?: number
  name: string
  version: string
  configSchema: unknown
  visibility: string
}

export interface IntegrationDefinitionNetwork {
  providerHosts?: string[]
  ingressRelayed?: boolean
  webhookAuthMode?: 'shared_secret' | 'provider_verified'
}

export interface PublishIntegrationBundleResponse {
  integrationId: number
  versionId: number
  contentHash: string
}

export interface BotCommand {
  command: string
  description: string
}

export interface DevBotReadinessIntegration {
  id?: string
  installationId?: string
  name?: string
  version?: string
  enabled?: boolean
  configurationType?: string
  configurationRevision?: string
  status?: string
  statusReason?: string
}

export interface DevBotReadinessPlugin {
  id?: string
  name?: string
  version?: string
  enabled?: boolean
  configuration?: Record<string, unknown>
  interfaces?: Record<string, unknown>
  integrations?: Record<string, unknown>
}

export interface DevBotReadinessBot {
  id: string
  name?: string
  dev?: boolean
  url?: string
  updatedAt?: string
  integrations: Record<string, DevBotReadinessIntegration>
  plugins?: Record<string, DevBotReadinessPlugin>
  tags?: Record<string, string>
  devReadiness?: unknown
}

export interface DevBotReadinessResponse {
  bot: DevBotReadinessBot
}

export interface WorkspaceInstallResponse {
  installationId: string
  webhookId: string
  status: string
}

export interface WorkspaceRegisterResponse {
  ok: boolean
  status: string
  webhookUrl: string
}

export interface WorkspaceIntegrationInstallation {
  id: string
  name: string
  version: string
  ref: string
  alias: string
  enabled: boolean
  status: string
  statusReason: string
  webhookId: string
  registered: boolean
}

export interface WorkspaceIntegrationListResponse {
  installations: WorkspaceIntegrationInstallation[]
}

// GET /v1/admin/bots/{id}/logs response shape, frozen from
// packages/botruntime-api/openapi/openapi.json's getBotLogsResponse schema
// (fields: timestamp/level/message required, workflowId/userId/conversationId
// optional). Auth = the MACHINE key (profile.token), not the per-bot key.
export interface LogEntry {
  timestamp: string
  level: string
  message: string
  workflowId?: string
  userId?: string
  conversationId?: string
}

export interface BotLogsResponse {
  logs: LogEntry[]
  nextToken?: string
}

export interface GetBotLogsParams {
  timeStart: string
  timeEnd?: string
  level?: string
  messageContains?: string
  conversationId?: string
  nextToken?: string
}

export interface TraceListParams {
  conversationId: string
  pageSize: number
  status?: 'unset' | 'ok' | 'error'
  error?: boolean
  source?: string
  name?: string
  workflow?: string
  action?: string
  traceId?: string
  since?: string
  until?: string
  nextToken?: string
}

export interface ConversationListParams {
  pageSize: number
  nextToken?: string
}

export interface EvalRunListParams {
  limit: number
  status?: 'pending' | 'running' | 'completed' | 'failed'
  nextToken?: string
}

interface RequestOpts {
  method: string
  path: string
  body?: unknown
  botId?: string
  internalToken?: string
  workspaceId?: string
  timeoutMs?: number
  idempotent?: boolean // retry on 5xx/network
  privacySensitive?: 'trace' | 'conversation' | 'eval' // never reflect response bodies or transport errors into CLI errors
}

const DEFAULT_TIMEOUT_MS = 30_000
const BUNDLE_TIMEOUT_MS = 120_000
const MAX_RETRIES = 3

type IntegrationDefinitionWriteBody = {
  name: string
  version: string
  configSchema: unknown
  providerHosts?: string[]
  ingressRelayed?: boolean
  webhookAuthMode?: 'shared_secret' | 'provider_verified'
}

const integrationDefinitionWriteBody = (
  name: string,
  version: string,
  configSchema: unknown,
  network?: IntegrationDefinitionNetwork
): IntegrationDefinitionWriteBody => ({
  name,
  version,
  configSchema,
  // Catalog updates use patch semantics, so omission would preserve stale policy.
  providerHosts: network?.providerHosts ?? [],
  ingressRelayed: network?.ingressRelayed ?? false,
  webhookAuthMode: network?.webhookAuthMode ?? 'shared_secret',
})

export class CloudapiClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  public withKey(apiKey: string): CloudapiClient {
    return new CloudapiClient(this.baseUrl, apiKey)
  }

  public get base(): string {
    return this.baseUrl
  }

  private async raw(opts: RequestOpts): Promise<any> {
    const url = `${this.baseUrl}${opts.path}`
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
    }
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    if (opts.botId) headers['x-bot-id'] = opts.botId
    if (opts.internalToken) headers['x-internal-token'] = opts.internalToken
    if (opts.workspaceId) headers['x-workspace-id'] = opts.workspaceId

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const attempts = opts.idempotent ? MAX_RETRIES : 1
    let lastErr: Error | undefined

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetch(url, {
          method: opts.method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        const text = await res.text()
        if (!res.ok) {
          // 4xx is never retried; 5xx is retried only for idempotent calls.
          if (res.status >= 500 && opts.idempotent && attempt < attempts) {
            lastErr = new errors.BotpressCLIError(`${requestLabel(opts)}: HTTP ${res.status} ${text}`)
            await backoff(attempt)
            continue
          }
          throw new errors.HTTPError(res.status, httpMessage(opts, res.status, text))
        }
        if (!text) return {}
        try {
          return JSON.parse(text)
        } catch (thrown) {
          if (opts.privacySensitive) {
            throw new errors.BotpressCLIError(
              `${requestLabel(opts)}: ${opts.privacySensitive} response is malformed JSON`
            )
          }
          throw thrown
        }
      } catch (thrown) {
        clearTimeout(timer)
        // An HTTP-status decision (4xx, or 5xx on the last attempt) is already
        // final — never retried. Only genuine network/abort errors retry.
        if (thrown instanceof errors.HTTPError || thrown instanceof errors.BotpressCLIError) throw thrown
        lastErr = thrown as Error
        if (opts.idempotent && attempt < attempts) {
          await backoff(attempt)
          continue
        }
        if (opts.privacySensitive) {
          throw new errors.BotpressCLIError(
            `${requestLabel(opts)}: network request failed; check connectivity and the selected API URL, then retry`
          )
        }
        throw new errors.BotpressCLIError(`${requestLabel(opts)}: ${(thrown as Error).message}`, {
          cause: thrown as Error,
        })
      }
    }
    throw lastErr ?? new errors.BotpressCLIError(`${requestLabel(opts)}: failed`)
  }

  // ---- provision (NOT idempotent, NOT retried) -----------------------------
  // workspaceId is threaded onto x-workspace-id UNCONDITIONALLY from the
  // resolved workspaceId — required now that provision-under-PAT is live: a
  // workspace-scoped PAT provisioning with no x-workspace-id returns 400. The
  // server reads x-workspace-id only on the PAT auth path and ignores it for
  // legacy/bot-scoped keys (auth.go:12), so sending it is harmless for those.
  public async provisionBot(name?: string, workspaceId?: string): Promise<ProvisionResponse> {
    return this.raw({
      method: 'POST',
      path: '/v1/admin/provision-bot',
      body: { name },
      workspaceId,
    })
  }

  // ---- deploy bundle (idempotent upsert) -----------------------------------
  // workspaceId (x-workspace-id) is what lets a workspace-scoped PAT deploy any
  // bot it owns/admins (Botpress parity: one `brt login` deploys the workspace).
  // The server resolves the bot by the numeric path id within that workspace and
  // gates owner|admin; it ignores x-workspace-id for legacy bot-scoped keys, so
  // threading it is harmless for the machine/CI principal too. Omitted → the
  // server falls back to bot-key scoping (the legacy path).
  public async putBundle(
    botId: string,
    name: string,
    code: string,
    commands: BotCommand[] = [],
    workspaceId?: string,
    recurringEvents: Record<
      string,
      { type: string; schedule: { cron: string }; payload: Record<string, unknown> }
    > = {}
  ): Promise<unknown> {
    return this.raw({
      method: 'PUT',
      path: `/v1/admin/bots/${botId}`,
      botId,
      workspaceId,
      body: { name, code, type: 'adk', commands, recurringEvents },
      timeoutMs: BUNDLE_TIMEOUT_MS,
      idempotent: true,
    })
  }

  public async getDevBotTarget(botId: string, workspaceId: string): Promise<DevBotReadinessResponse> {
    return this.raw({
      method: 'GET',
      path: `/v1/admin/bots/${encodeURIComponent(botId)}`,
      workspaceId,
    })
  }

  public async getBundle(botId: string, internalToken?: string): Promise<BundleResponse> {
    return this.raw({
      method: 'GET',
      path: `/internal/bots/${botId}/bundle`,
      botId,
      internalToken,
      timeoutMs: BUNDLE_TIMEOUT_MS,
      idempotent: true,
    })
  }

  public async listBots(): Promise<{
    bots: Array<{ id: string; name?: string }>
  }> {
    return this.raw({
      method: 'GET',
      path: '/v1/admin/bots',
      idempotent: true,
    })
  }

  public async listWorkspaces(): Promise<unknown> {
    return this.raw({
      method: 'GET',
      path: '/v1/admin/workspaces',
      idempotent: true,
    })
  }

  // ---- config variables (env.X parity) -------------------------------------
  public async setConfigVar(botId: string, name: string, value: string): Promise<unknown> {
    return this.raw({
      method: 'PUT',
      path: `/v1/admin/config-variables/${name}`,
      botId,
      body: { value },
    })
  }

  public async listConfigVars(botId: string): Promise<{ variables: ConfigVar[] }> {
    return this.raw({
      method: 'GET',
      path: '/v1/admin/config-variables',
      botId,
      idempotent: true,
    })
  }

  public async deleteConfigVar(botId: string, name: string): Promise<unknown> {
    return this.raw({
      method: 'DELETE',
      path: `/v1/admin/config-variables/${name}`,
      botId,
    })
  }

  public async setWorkspaceConfigVar(
    workspaceId: string,
    botId: string,
    name: string,
    value: string
  ): Promise<unknown> {
    return this.raw({
      method: 'PUT',
      path: `/v1/admin/workspaces/${encodeURIComponent(workspaceId)}/bots/${encodeURIComponent(botId)}/config-variables/${encodeURIComponent(name)}`,
      body: { value },
    })
  }

  public async listWorkspaceConfigVars(workspaceId: string, botId: string): Promise<{ variables: ConfigVar[] }> {
    return this.raw({
      method: 'GET',
      path: `/v1/admin/workspaces/${encodeURIComponent(workspaceId)}/bots/${encodeURIComponent(botId)}/config-variables`,
      idempotent: true,
    })
  }

  public async deleteWorkspaceConfigVar(workspaceId: string, botId: string, name: string): Promise<unknown> {
    return this.raw({
      method: 'DELETE',
      path: `/v1/admin/workspaces/${encodeURIComponent(workspaceId)}/bots/${encodeURIComponent(botId)}/config-variables/${encodeURIComponent(name)}`,
    })
  }

  // ---- integrations (install NOT idempotent; register idempotent) ----------
  public async installIntegration(
    botId: string,
    name: string,
    version: string,
    config: Record<string, unknown>,
    alias?: string
  ): Promise<InstallResponse> {
    return this.raw({
      method: 'POST',
      path: '/v1/admin/integrations/install',
      botId,
      body: { name, version, alias, config },
    })
  }

  public async registerIntegration(botId: string, webhookId: string): Promise<RegisterResponse> {
    return this.raw({
      method: 'POST',
      path: `/v1/admin/integrations/${webhookId}/register`,
      botId,
      idempotent: true,
    })
  }

  public async installWorkspaceIntegration(
    workspaceId: string,
    botId: string,
    name: string,
    version: string,
    config: Record<string, unknown>,
    alias?: string
  ): Promise<WorkspaceInstallResponse> {
    return this.raw({
      method: 'POST',
      path: `/v1/admin/workspaces/${encodeURIComponent(workspaceId)}/bots/${encodeURIComponent(botId)}/integrations`,
      body: { name, version, alias, config },
    })
  }

  public async listWorkspaceIntegrations(
    workspaceId: string,
    botId: string
  ): Promise<WorkspaceIntegrationListResponse> {
    return this.raw({
      method: 'GET',
      path: `/v1/admin/workspaces/${encodeURIComponent(workspaceId)}/bots/${encodeURIComponent(botId)}/integrations`,
      idempotent: true,
    })
  }

  public async registerWorkspaceIntegration(
    workspaceId: string,
    botId: string,
    webhookId: string
  ): Promise<WorkspaceRegisterResponse> {
    return this.raw({
      method: 'POST',
      path: `/v1/admin/workspaces/${encodeURIComponent(workspaceId)}/bots/${encodeURIComponent(botId)}/integrations/${encodeURIComponent(webhookId)}/register`,
      idempotent: true,
    })
  }

  public async createIntegrationDefinition(
    name: string,
    version: string,
    configSchema: unknown,
    workspaceId?: string,
    network?: IntegrationDefinitionNetwork
  ): Promise<IntegrationDefinitionEntity> {
    return this.raw({
      method: 'POST',
      path: '/v1/admin/integration-definitions',
      workspaceId,
      body: integrationDefinitionWriteBody(name, version, configSchema, network),
    })
  }

  public async updateIntegrationDefinition(
    id: number,
    name: string,
    version: string,
    configSchema: unknown,
    workspaceId?: string,
    network?: IntegrationDefinitionNetwork
  ): Promise<IntegrationDefinitionEntity> {
    return this.raw({
      method: 'PUT',
      path: `/v1/admin/integration-definitions/${id}`,
      workspaceId,
      body: integrationDefinitionWriteBody(name, version, configSchema, network),
    })
  }

  public async listIntegrationDefinitions(
    workspaceId?: string
  ): Promise<{ definitions: IntegrationDefinitionEntity[] }> {
    return this.raw({
      method: 'GET',
      path: '/v1/admin/integration-definitions',
      workspaceId,
      idempotent: true,
    })
  }

  // publishIntegrationBundle uploads the BUILT integration .cjs against a catalog definition
  // (resolved by name@version in the caller's workspace scope). The server dedups the blob by
  // content hash but STILL writes a new version row per accepted call, so this is NOT safe to
  // auto-retry: a timeout/5xx after the server already accepted the upload would, on retry,
  // publish a duplicate version. Deliberate divergence from the thin CLI (which marked this
  // idempotent) — a transient failure surfaces loudly for a deliberate re-run instead of
  // silently creating duplicate versions.
  public async publishIntegrationBundle(
    name: string,
    version: string,
    code: string,
    workspaceId?: string
  ): Promise<PublishIntegrationBundleResponse> {
    return this.raw({
      method: 'POST',
      path: '/v1/admin/integrations/publish-bundle',
      workspaceId,
      body: { name, version, code },
      timeoutMs: BUNDLE_TIMEOUT_MS,
      idempotent: false,
    })
  }

  // ---- logs (workspace PAT; idempotent GET) --------------------------------
  // timeStart is REQUIRED by the server; every other param is appended only
  // when defined so an absent filter is simply omitted from the query string
  // (never sent as the literal string "undefined").
  public async getWorkspaceBotLogs(
    workspaceId: string,
    botId: string,
    params: GetBotLogsParams
  ): Promise<BotLogsResponse> {
    const qs = new URLSearchParams({ timeStart: params.timeStart })
    if (params.timeEnd) qs.set('timeEnd', params.timeEnd)
    if (params.level) qs.set('level', params.level)
    if (params.messageContains) qs.set('messageContains', params.messageContains)
    if (params.conversationId) qs.set('conversationId', params.conversationId)
    if (params.nextToken) qs.set('nextToken', params.nextToken)
    return this.raw({
      method: 'GET',
      path:
        `/v1/admin/workspaces/${encodeURIComponent(workspaceId)}` +
        `/bots/${encodeURIComponent(botId)}/logs?${qs.toString()}`,
      idempotent: true,
    })
  }

  // ---- traces (metadata-only readers; idempotent GET) ---------------------
  // Production uses the human/PAT route with canonical numeric workspace and
  // bot coordinates. Development uses the bot-scoped route and narrows the PAT
  // with the attested opaque runtime bot id. Both response bodies are treated
  // as untrusted until the command applies its own strict privacy projection.
  public async listWorkspaceTraces(
    workspaceId: string,
    botId: string,
    params: TraceListParams
  ): Promise<unknown> {
    return this.raw({
      method: 'GET',
      path: tracePath(
        `/v1/admin/workspaces/${encodeURIComponent(workspaceId)}/bots/${encodeURIComponent(botId)}/traces`,
        params
      ),
      idempotent: true,
      privacySensitive: 'trace',
    })
  }

  public async listDevelopmentTraces(
    runtimeBotId: string,
    params: TraceListParams
  ): Promise<unknown> {
    return this.raw({
      method: 'GET',
      path: tracePath('/v1/traces', params),
      botId: runtimeBotId,
      idempotent: true,
      privacySensitive: 'trace',
    })
  }

  // ---- conversations (metadata-only readers; idempotent GET) -------------
  // Tags are present on the backend entity but are intentionally projected out
  // by the command before either human or JSON output is produced.
  public async listWorkspaceConversations(
    workspaceId: string,
    botId: string,
    params: ConversationListParams
  ): Promise<unknown> {
    return this.raw({
      method: 'GET',
      path: conversationPath(
        `/v1/admin/workspaces/${encodeURIComponent(workspaceId)}/bots/${encodeURIComponent(botId)}/conversations`,
        params
      ),
      idempotent: true,
      privacySensitive: 'conversation',
    })
  }

  public async listDevelopmentConversations(
    runtimeBotId: string,
    params: ConversationListParams
  ): Promise<unknown> {
    return this.raw({
      method: 'GET',
      path: conversationPath('/v1/chat/conversations', params),
      botId: runtimeBotId,
      idempotent: true,
      privacySensitive: 'conversation',
    })
  }

  public async createEvalWorkflow(
    body: {
      name: 'builtin_eval_runner'
      status: 'pending'
      input: Record<string, unknown>
      timeoutAt: string
    },
    runtimeBotId?: string
  ): Promise<unknown> {
    return this.raw({
      method: 'POST',
      path: '/v1/chat/workflows',
      body,
      botId: runtimeBotId,
      privacySensitive: 'eval',
    })
  }

  public async getEvalWorkflow(workflowId: string, runtimeBotId?: string): Promise<unknown> {
    return this.raw({
      method: 'GET',
      path: `/v1/chat/workflows/${encodeURIComponent(workflowId)}`,
      botId: runtimeBotId,
      idempotent: true,
      privacySensitive: 'eval',
    })
  }

  public async listEvalRuns(
    selector: string,
    params: EvalRunListParams,
    runtimeBotId?: string
  ): Promise<unknown> {
    return this.raw({
      method: 'GET',
      path: evalRunsPath(`/v1/evals/bot/${encodeURIComponent(selector)}/runs`, params),
      botId: runtimeBotId,
      idempotent: true,
      privacySensitive: 'eval',
    })
  }

  public async getEvalRun(runId: string, runtimeBotId?: string): Promise<unknown> {
    return this.raw({
      method: 'GET',
      path: `/v1/evals/runs/${encodeURIComponent(runId)}`,
      botId: runtimeBotId,
      idempotent: true,
      privacySensitive: 'eval',
    })
  }

  // ---- tables (list idempotent; create NOT — 409 means already exists) ------
  // /v1/tables/* discriminates the deploy caller from the dev callback by the
  // presence of x-workspace-id (dev does not send it); under a workspace PAT
  // the deploy therefore sends BOTH x-workspace-id (writer gate owner|admin)
  // and x-bot-id (numeric, which table set to address).
  public async listTables(botId: string, workspaceId?: string): Promise<{ tables: Array<{ name: string }> }> {
    return this.raw({
      method: 'GET',
      path: '/v1/tables',
      botId,
      workspaceId,
      idempotent: true,
    })
  }

  public async createTable(botId: string, name: string, schema: unknown, workspaceId?: string): Promise<unknown> {
    return this.raw({
      method: 'POST',
      path: '/v1/tables',
      botId,
      workspaceId,
      body: { name, schema },
    })
  }
}

async function backoff(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)))
}

function httpMessage(opts: RequestOpts, status: number, text: string): string {
  const where = requestLabel(opts)
  if (opts.privacySensitive) {
    const resource = opts.privacySensitive
    if (status === 401)
      return `${where}: 401 — selected credential is missing, invalid, or revoked; for dev run \`brt login\`, for production re-link the per-bot key with \`brt link --key-stdin\``
    if (status === 403)
      return `${where}: 403 — the active profile has no access to this workspace/bot; verify membership and the selected profile`
    if (status === 404)
      return `${where}: 404 — ${resource} target not found; verify the canonical project link and run \`brt link\` if it is stale`
    if (status >= 500)
      return `${where}: HTTP ${status} — ${resource} service failed; retry or check the server status`
    return `${where}: HTTP ${status} — ${resource} request was rejected; check the command filters and target`
  }
  if (status === 401) return `${where}: 401 — empty/invalid/revoked api key; check \`brt profiles list\` / \`brt link\``
  if (status === 404) return `${where}: 404 — ${text || 'not found'}`
  if (status === 409) return `${where}: 409 — already exists / unique constraint (${text})`
  if (status === 500 && opts.path.includes('provision'))
    return `${where}: 500 — likely "no workspace scope"; key must carry a workspace (${text})`
  return `${where}: HTTP ${status} ${text}`
}

// Query values are intentionally excluded from errors: besides keeping
// correlation IDs out of diagnostics, percent-encoded values would be parsed
// as printf directives by verror when the message is wrapped.
function requestLabel(opts: RequestOpts): string {
  return `${opts.method} ${opts.path.split('?', 1)[0]}`
}

function tracePath(basePath: string, params: TraceListParams): string {
  const query = new URLSearchParams({
    conversationId: params.conversationId,
    pageSize: String(params.pageSize),
  })
  if (params.status !== undefined) query.set('status', params.status)
  if (params.error !== undefined) query.set('error', String(params.error))
  if (params.source !== undefined) query.set('source', params.source)
  if (params.name !== undefined) query.set('name', params.name)
  if (params.workflow !== undefined) query.set('workflow', params.workflow)
  if (params.action !== undefined) query.set('action', params.action)
  if (params.traceId !== undefined) query.set('traceId', params.traceId)
  if (params.since !== undefined) query.set('since', params.since)
  if (params.until !== undefined) query.set('until', params.until)
  if (params.nextToken) query.set('nextToken', params.nextToken)
  return `${basePath}?${query.toString()}`
}

function conversationPath(basePath: string, params: ConversationListParams): string {
  const query = new URLSearchParams({ pageSize: String(params.pageSize) })
  if (params.nextToken) query.set('nextToken', params.nextToken)
  return `${basePath}?${query.toString()}`
}

function evalRunsPath(basePath: string, params: EvalRunListParams): string {
  const query = new URLSearchParams({ limit: String(params.limit) })
  if (params.status !== undefined) query.set('status', params.status)
  if (params.nextToken !== undefined) query.set('nextToken', params.nextToken)
  return `${basePath}?${query.toString()}`
}
