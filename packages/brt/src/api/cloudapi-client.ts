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

export interface PublishIntegrationBundleResponse {
  integrationId: number
  versionId: number
  contentHash: string
}

export interface BotCommand {
  command: string
  description: string
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

interface RequestOpts {
  method: string
  path: string
  body?: unknown
  botId?: string
  internalToken?: string
  workspaceId?: string
  timeoutMs?: number
  idempotent?: boolean // retry on 5xx/network
}

const DEFAULT_TIMEOUT_MS = 30_000
const BUNDLE_TIMEOUT_MS = 120_000
const MAX_RETRIES = 3

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
            lastErr = new errors.BotpressCLIError(`${opts.method} ${opts.path}: HTTP ${res.status} ${text}`)
            await backoff(attempt)
            continue
          }
          throw new errors.HTTPError(res.status, httpMessage(opts, res.status, text))
        }
        return text ? JSON.parse(text) : {}
      } catch (thrown) {
        clearTimeout(timer)
        // An HTTP-status decision (4xx, or 5xx on the last attempt) is already
        // final — never retried. Only genuine network/abort errors retry.
        if (thrown instanceof errors.HTTPError) throw thrown
        lastErr = thrown as Error
        if (opts.idempotent && attempt < attempts) {
          await backoff(attempt)
          continue
        }
        throw new errors.BotpressCLIError(`${opts.method} ${opts.path}: ${(thrown as Error).message}`, {
          cause: thrown as Error,
        })
      }
    }
    throw lastErr ?? new errors.BotpressCLIError(`${opts.method} ${opts.path}: failed`)
  }

  // ---- provision (NOT idempotent, NOT retried) -----------------------------
  // workspaceId is threaded onto x-workspace-id UNCONDITIONALLY from the
  // resolved workspaceId — required now that provision-under-PAT is live: a
  // workspace-scoped PAT provisioning with no x-workspace-id returns 400. The
  // server reads x-workspace-id only on the PAT auth path and ignores it for
  // legacy/bot-scoped keys (auth.go:12), so sending it is harmless for those.
  public async provisionBot(name?: string, workspaceId?: string): Promise<ProvisionResponse> {
    return this.raw({ method: 'POST', path: '/v1/admin/provision-bot', body: { name }, workspaceId })
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
    workspaceId?: string
  ): Promise<unknown> {
    return this.raw({
      method: 'PUT',
      path: `/v1/admin/bots/${botId}`,
      botId,
      workspaceId,
      body: { name, code, type: 'adk', commands },
      timeoutMs: BUNDLE_TIMEOUT_MS,
      idempotent: true,
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

  public async listBots(): Promise<{ bots: Array<{ id: string; name?: string }> }> {
    return this.raw({ method: 'GET', path: '/v1/admin/bots', idempotent: true })
  }

  public async listWorkspaces(): Promise<unknown> {
    return this.raw({ method: 'GET', path: '/v1/admin/workspaces', idempotent: true })
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

  public async createIntegrationDefinition(
    name: string,
    version: string,
    configSchema: unknown,
    workspaceId?: string
  ): Promise<IntegrationDefinitionEntity> {
    return this.raw({
      method: 'POST',
      path: '/v1/admin/integration-definitions',
      workspaceId,
      body: { name, version, configSchema },
    })
  }

  public async updateIntegrationDefinition(
    id: number,
    name: string,
    version: string,
    configSchema: unknown,
    workspaceId?: string
  ): Promise<IntegrationDefinitionEntity> {
    return this.raw({
      method: 'PUT',
      path: `/v1/admin/integration-definitions/${id}`,
      workspaceId,
      body: { name, version, configSchema },
    })
  }

  public async listIntegrationDefinitions(workspaceId?: string): Promise<{ definitions: IntegrationDefinitionEntity[] }> {
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

  // ---- logs (admin, machine-key; idempotent GET) ---------------------------
  // timeStart is REQUIRED by the server; every other param is appended only
  // when defined so an absent filter is simply omitted from the query string
  // (never sent as the literal string "undefined").
  public async getBotLogs(botId: string, params: GetBotLogsParams): Promise<BotLogsResponse> {
    const qs = new URLSearchParams({ timeStart: params.timeStart })
    if (params.timeEnd) qs.set('timeEnd', params.timeEnd)
    if (params.level) qs.set('level', params.level)
    if (params.messageContains) qs.set('messageContains', params.messageContains)
    if (params.conversationId) qs.set('conversationId', params.conversationId)
    if (params.nextToken) qs.set('nextToken', params.nextToken)
    return this.raw({
      method: 'GET',
      path: `/v1/admin/bots/${botId}/logs?${qs.toString()}`,
      botId,
      idempotent: true,
    })
  }

  // ---- tables (list idempotent; create NOT — 409 means already exists) ------
  // /v1/tables/* discriminates the deploy caller from the dev callback by the
  // presence of x-workspace-id (dev does not send it); under a workspace PAT
  // the deploy therefore sends BOTH x-workspace-id (writer gate owner|admin)
  // and x-bot-id (numeric, which table set to address).
  public async listTables(botId: string, workspaceId?: string): Promise<{ tables: Array<{ name: string }> }> {
    return this.raw({ method: 'GET', path: '/v1/tables', botId, workspaceId, idempotent: true })
  }

  public async createTable(botId: string, name: string, schema: unknown, workspaceId?: string): Promise<unknown> {
    return this.raw({ method: 'POST', path: '/v1/tables', botId, workspaceId, body: { name, schema } })
  }
}

async function backoff(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)))
}

function httpMessage(opts: RequestOpts, status: number, text: string): string {
  const where = `${opts.method} ${opts.path}`
  if (status === 401) return `${where}: 401 — empty/invalid/revoked api key; check \`brt profiles list\` / \`brt link\``
  if (status === 404) return `${where}: 404 — ${text || 'not found'}`
  if (status === 409) return `${where}: 409 — already exists / unique constraint (${text})`
  if (status === 500 && opts.path.includes('provision'))
    return `${where}: 500 — likely "no workspace scope"; key must carry a workspace (${text})`
  return `${where}: HTTP ${status} ${text}`
}
