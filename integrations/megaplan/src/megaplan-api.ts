// Megaplan CRM client, APIv3. Ported from the Go client
// (main:api/internal/clients/megaplan/{megaplan.go,api.go}). It owns: lazy token
// cache + reauth-once-on-401, JSON-in-querystring, {meta,data} unwrap, contentType
// injection, decimal Money / DateTime serialization, escaped path ids, body-size
// cap, the retry policy (429 any method / 5xx GET-only / no create-retry) and
// sanitized typed errors. Donor invariant comments are preserved verbatim in spirit.
//
// Auth — OAuth2 password grant; the token lives >=180 days. Megaplan's guidance is
// to store it and re-issue ONLY on 401, never on a timer. Account limits: 5 rps and
// 1000 req/hour.

import {
  ApiError,
  type Comment,
  type Contractor,
  type ContractorHuman,
  ContentType,
  type CommentOwnerName,
  type Deal,
  DateTime,
  type FileRef,
  Money,
  type Program,
  type ProgramState,
  type Ref,
  selectTransition,
  type Task,
  type NegotiationItem,
  type TaskActionName,
  type Todo,
  encodeBody,
} from './types'

const AUTH_PATH = '/api/v3/auth/access_token'
const DEFAULT_RETRY_DELAY_MS = 500
const MAX_ATTEMPTS = 3
// maxBodyBytes — read cap: the API returns megabyte-size trace blobs in errors, an
// unbounded read is pointless.
const MAX_BODY_BYTES = 10 << 20
export const MAX_APPROVAL_FILE_BYTES = 20 << 20

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

// TokenStore — optional cross-invocation cache of the access token. On our
// multi-tenant runtime-host a client is built per action invocation, so an
// in-memory token would not survive; backing it by integration state mirrors the
// Go in-memory cache across invocations. Absent => in-memory only (re-auth per
// instance, which is cheap and transient-retried).
export type TokenStore = {
  load(): Promise<string | null>
  save(token: string): Promise<void>
  clear(): Promise<void>
}

export type MegaplanConfig = {
  // baseUrl — account address: https://<account>.megaplan.ru
  baseUrl: string
  username: string
  password: string
  retryDelayMs?: number
  tokenStore?: TokenStore
  // fetchImpl — override for tests; defaults to global fetch.
  fetchImpl?: FetchLike
}

type Method = 'GET' | 'POST'

function transientStatus(status: number): boolean {
  // transport error (0), rate limit (429), server fault (5xx). Other 4xx are
  // request errors — a retry is pointless.
  return status === 0 || status === 429 || status >= 500
}

function canRetry(method: Method, status: number): boolean {
  // 429 is safe for any method — the limiter rejects the request before processing,
  // so no duplicate. 5xx / dropped connection: GET only — a POST create may have
  // already applied server-side and a retry would duplicate the lead/deal/comment.
  if (status === 429) {
    return true
  }
  return method === 'GET' && transientStatus(status)
}

function prune<T extends Record<string, unknown>>(obj: T): T {
  // Mirror Go `omitempty`: drop undefined / empty-string / empty-array so an update
  // sends only changed fields and a create omits blanks. Booleans (false) and
  // numbers (0) are kept — they are meaningful (e.g. Task.isUrgent=false).
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
      continue
    }
    out[k] = v
  }
  return out as T
}

export class MegaplanApiClient {
  private readonly baseUrl: string
  private readonly username: string
  private readonly password: string
  private readonly retryDelayMs: number
  private readonly store?: TokenStore
  private readonly fetchImpl: FetchLike

  // Token cached until the first 401; issuance is serialized so concurrent first
  // calls do not stampede the auth endpoint.
  private memToken: string | null = null
  private inflight: Promise<string> | null = null

  constructor(cfg: MegaplanConfig) {
    if (!cfg.baseUrl) {
      throw new Error('megaplan: baseUrl is required')
    }
    if (!cfg.username || !cfg.password) {
      throw new Error('megaplan: username and password are required')
    }
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '')
    this.username = cfg.username
    this.password = cfg.password
    this.retryDelayMs = cfg.retryDelayMs && cfg.retryDelayMs > 0 ? cfg.retryDelayMs : DEFAULT_RETRY_DELAY_MS
    this.store = cfg.tokenStore
    this.fetchImpl = cfg.fetchImpl ?? ((url, init) => fetch(url, init))
  }

  // ── Operations (ported from api.go) ────────────────────────────────────────

  // searchContractors — full-text contractor search (q = phone, name, email). Use
  // before create to dedup. NOTE: q-search returns empty on a fresh account (the
  // index is not built) — treat as best-effort; real dedup is our own stored
  // megaplan_contractor_id map.
  async searchContractors(q: string, limit?: number): Promise<Contractor[]> {
    return this.do<Contractor[]>('GET', '/api/v3/contractor', prune({ q, limit }), undefined)
  }

  // createContractorHuman — create a physical person. The generic /contractor is
  // READ-ONLY; create goes through the type-specific endpoint. (`name` is None right
  // after create — rely on firstName/lastName.)
  async createContractorHuman(h: {
    firstName?: string
    middleName?: string
    lastName?: string
    description?: string
    contactInfo: { type: string; value: string; comment?: string }[]
  }): Promise<ContractorHuman> {
    const body = prune({
      contentType: ContentType.ContractorHuman,
      firstName: h.firstName,
      middleName: h.middleName,
      lastName: h.lastName,
      description: h.description,
      contactInfo: h.contactInfo.map((c) =>
        prune({ contentType: ContentType.ContactInfo, type: c.type, value: c.value, comment: c.comment })
      ),
    })
    return this.do<ContractorHuman>('POST', '/api/v3/contractorHuman', undefined, body)
  }

  async getDeal(id: string): Promise<Deal> {
    return this.do<Deal>('GET', `/api/v3/deal/${esc(id)}`, undefined, undefined)
  }

  // createDeal — only Program is required; custom program fields are account-specific
  // (GET /program/{id}/fields) and not modeled here.
  async createDeal(d: {
    programId: string
    contractorId?: string
    managerId?: string
    name?: string
    description?: string
    stateId?: string
    price?: Money
  }): Promise<Deal> {
    const body = prune({
      contentType: ContentType.Deal,
      name: d.name,
      description: d.description,
      program: { contentType: ContentType.Program, id: d.programId } satisfies Ref,
      contractor: d.contractorId ? ({ contentType: ContentType.ContractorHuman, id: d.contractorId } satisfies Ref) : undefined,
      manager: d.managerId ? ({ contentType: ContentType.Employee, id: d.managerId } satisfies Ref) : undefined,
      state: d.stateId ? { contentType: ContentType.ProgramState, id: d.stateId } : undefined,
      price: d.price,
    })
    return this.do<Deal>('POST', '/api/v3/deal', undefined, body)
  }

  // updateDealFields — partial field edit (APIv3: update = POST on /{id}); sends ONLY
  // the changed fields, the rest of the card is untouched. NEVER moves the pipeline
  // stage: a `state` write here is silently ignored by the API — use moveDealStage.
  async updateDealFields(
    id: string,
    fields: { name?: string; description?: string; managerId?: string; price?: Money }
  ): Promise<Deal> {
    const body = prune({
      contentType: ContentType.Deal,
      name: fields.name,
      description: fields.description,
      manager: fields.managerId ? ({ contentType: ContentType.Employee, id: fields.managerId } satisfies Ref) : undefined,
      price: fields.price,
    })
    if (Object.keys(body).length === 1) {
      throw new Error('megaplan: updateDealFields requires at least one field')
    }
    return this.do<Deal>('POST', `/api/v3/deal/${esc(id)}`, undefined, body)
  }

  // applyTransition — move a deal along the pipeline. The body is the RAW transition
  // object from Deal.possibleTransitions, posted VERBATIM: writing `state` directly
  // does not move the deal, and rebuilding the transition loses the account-specific
  // fields of the nested `to`.
  async applyTransition(dealId: string, transition: unknown): Promise<Deal> {
    return this.do<Deal>('POST', `/api/v3/deal/${esc(dealId)}/applyTransition`, undefined, transition)
  }

  // moveDealStage — getDeal -> pick the transition whose to.id == targetStateId ->
  // applyTransition verbatim. Missing transition is a hard contract error: a
  // successful no-op would hide a wrong stage id or an impossible pipeline move.
  async moveDealStage(dealId: string, targetStateId: string): Promise<{ moved: true; deal: Deal }> {
    const deal = await this.getDeal(dealId)
    const transition = selectTransition(deal.possibleTransitions, targetStateId)
    if (transition === null) {
      throw new Error(`megaplan: deal ${dealId} has no transition to state ${targetStateId}`)
    }
    const updated = await this.applyTransition(dealId, transition)
    return { moved: true, deal: updated }
  }

  // listPrograms / programStates — resolve program + stage ids by name. Programs are
  // created only in the UI (POST /program => 405); discover them at runtime.
  async listPrograms(): Promise<Program[]> {
    return this.do<Program[]>('GET', '/api/v3/program', undefined, undefined)
  }

  async programStates(programId: string): Promise<ProgramState[]> {
    return this.do<ProgramState[]>('GET', `/api/v3/program/${esc(programId)}/states`, undefined, undefined)
  }

  // addComment — HTML comment on an entity: the Telegram dialog link on a lead, the
  // Yandex.Disk doc links on a deal. owner ∈ {deal, contractor, task}.
  async addComment(owner: CommentOwnerName, ownerId: string, contentHtml: string): Promise<Comment> {
    const body = { contentType: ContentType.Comment, content: contentHtml }
    return this.do<Comment>('POST', `/api/v3/${owner}/${esc(ownerId)}/comments`, undefined, body)
  }

  // createTodo — checklist item inside a deal card. Bound only via the sub-resource
  // /deal/{id}/todos: a standalone /todo does not attach to the deal.
  async createTodo(dealId: string, name: string, responsibleId: string): Promise<Todo> {
    const body = {
      contentType: ContentType.Todo,
      name,
      responsible: { contentType: ContentType.Employee, id: responsibleId } satisfies Ref,
    }
    return this.do<Todo>('POST', `/api/v3/deal/${esc(dealId)}/todos`, undefined, body)
  }

  // listTodos — todos of a deal; finished=false => open only (dedup before create),
  // undefined => all (filter omitted from the query).
  async listTodos(dealId: string, finished?: boolean): Promise<Todo[]> {
    const query = finished === undefined ? undefined : { finished }
    return this.do<Todo[]>('GET', `/api/v3/deal/${esc(dealId)}/todos`, query, undefined)
  }

  // finishTodo — the ONLY finish action of a checklist todo; the body is fixed by
  // schema (TodoFinishActionRequest), a string `action` is rejected.
  async finishTodo(todoId: string): Promise<Todo> {
    const body = { contentType: ContentType.TodoFinishActionRequest }
    return this.do<Todo>('POST', `/api/v3/todo/${esc(todoId)}/doAction`, undefined, body)
  }

  // createTask — escalation/gate task (L3). deals[] links it to the deal card and
  // counter. isTemplate/isUrgent are required by schema and meaningful at false (no
  // omit).
  async createTask(t: {
    name: string
    responsibleId: string
    dealIds: string[]
    deadline?: DateTime
    isUrgent?: boolean
    statement?: string
  }): Promise<Task> {
    const body = prune({
      contentType: ContentType.Task,
      isTemplate: false,
      isUrgent: t.isUrgent ?? false,
      name: t.name,
      responsible: { contentType: ContentType.Employee, id: t.responsibleId } satisfies Ref,
      deadline: t.deadline,
      deals: t.dealIds.map((id) => ({ contentType: ContentType.Deal, id }) satisfies Ref),
      statement: t.statement,
    })
    return this.do<Task>('POST', '/api/v3/task', undefined, body)
  }

  async createNegotiationTask(t: {
    name: string
    responsibleId: string
    approverIds: string[]
    dealIds: string[]
    materialName: string
    materialSha256: string
    materialFile: FileRef
    statement?: string
  }): Promise<Task> {
    if (t.approverIds.length === 0) {
      throw new Error('megaplan: createNegotiationTask requires at least one approver')
    }
    const materialText = [
      `<b>${escapeHtml(t.materialName)}</b>`,
      `<code>sha256:${escapeHtml(t.materialSha256)}</code>`,
    ].join('<br>')
    const body = prune({
      contentType: ContentType.Task,
      isTemplate: false,
      isUrgent: false,
      isNegotiation: true,
      name: t.name,
      statement: t.statement,
      responsible: { contentType: ContentType.Employee, id: t.responsibleId } satisfies Ref,
      deals: t.dealIds.map((id) => ({ contentType: ContentType.Deal, id }) satisfies Ref),
      executors: t.approverIds.map(
        (id) => ({ contentType: ContentType.Employee, id }) satisfies Ref
      ),
      negotiationItems: [
        {
          contentType: ContentType.NegotiationItem,
          versions: [
            {
              contentType: ContentType.NegotiationItemVersion,
              text: materialText,
              attache: { contentType: ContentType.File, id: t.materialFile.id },
            },
          ],
        },
      ],
    })
    return this.do<Task>('POST', '/api/v3/task', undefined, body)
  }

  async findNegotiationTask(operationMarker: string): Promise<Task | undefined> {
    const tasks = await this.do<Task[]>('GET', '/api/v3/task', { q: operationMarker, limit: 10 }, undefined)
    return tasks.find((task) => task.isNegotiation === true && task.name?.includes(`[${operationMarker}]`))
  }

  // Megaplan's file API is intentionally outside /api/v3. A file must be
  // uploaded first and then referenced by {contentType:"File",id} from the
  // entity/version being created. FormData owns the multipart boundary.
  async uploadFile(name: string, bytes: Uint8Array, contentType: string): Promise<FileRef> {
    if (!name.trim()) throw new Error('megaplan: uploadFile requires a file name')
    if (bytes.byteLength === 0) throw new Error('megaplan: uploadFile requires non-empty bytes')

    let reauthed = false
    for (let attempt = 1; ; ) {
      let token: string
      try {
        token = await this.accessToken()
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0
        if (transientStatus(status) && attempt < MAX_ATTEMPTS) {
          attempt++
          await this.backoff(attempt)
          continue
        }
        throw err
      }

      const form = new FormData()
      form.append('files[]', new Blob([new Uint8Array(bytes)], { type: contentType }), name)
      let response: Response
      try {
        response = await this.fetchImpl(this.baseUrl + '/api/file', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          body: form,
        })
      } catch (err) {
        throw new ApiError(0, [{ message: `POST /api/file: ${(err as Error)?.message ?? String(err)}` }])
      }

      const text = await readCapped(response, MAX_BODY_BYTES)
      if (response.status === 401 && !reauthed) {
        reauthed = true
        await this.clearToken(token)
        continue
      }
      if (response.status === 429 && attempt < MAX_ATTEMPTS) {
        attempt++
        await this.backoff(attempt)
        continue
      }
      if (!response.ok) throw parseApiError(response.status, text)
      return parseUploadedFile(text)
    }
  }

  async getNegotiationDecision(taskId: string): Promise<{
    status: 'pending' | 'approved' | 'rejected'
    itemId?: string
    versionId?: string
    fileId?: string
    filePath?: string
    fileName?: string
    actorId?: string
    actorName?: string
    approverVisas: Array<{
      id?: string
      status?: 'ok' | 'bad' | 'not_rated'
      actorId?: string
      actorName?: string
      comment?: string
      timeCreated?: string
    }>
  }> {
    const task = await this.do<Task>(
      'GET',
      `/api/v3/task/${esc(taskId)}`,
      undefined,
      undefined
    )
    const items = task.negotiationItems ?? []
    if (items.length === 0) {
      throw new Error(`megaplan: negotiation task ${taskId} has no materials`)
    }
    const rejected = items.find((item) => item.actualVersion?.status === 'bad')
    const approved = rejected === undefined && items.every((item) => item.actualVersion?.status === 'ok')
    const selected = rejected ?? items[0]!
    const version = selected.actualVersion
    const approverVisas = (version?.visas ?? []).map((visa) => ({
      id: visa.id,
      status: visa.status,
      actorId: visa.userCreated?.id,
      actorName: visa.userCreated?.name,
      comment: visa.comment?.content,
      timeCreated: visa.timeCreated,
    }))
    const representativeVisa = [...approverVisas].reverse().find((visa) =>
      rejected ? visa.status === 'bad' : visa.status === 'ok'
    )
    return {
      status: rejected ? 'rejected' : approved ? 'approved' : 'pending',
      itemId: selected.id,
      versionId: version?.id,
      fileId: version?.attache?.id,
      filePath: version?.attache?.path,
      fileName: version?.attache?.name ?? version?.attache?.fileName,
      actorId: representativeVisa?.actorId,
      actorName: representativeVisa?.actorName,
      approverVisas,
    }
  }

  async downloadFile(path: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    if (!path.startsWith('/')) throw new Error('megaplan: file path must be relative to the account root')
    let reauthed = false
    for (let attempt = 1; ;) {
      let token: string
      try {
        token = await this.accessToken()
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0
        if (canRetry('GET', status) && attempt < MAX_ATTEMPTS) {
          attempt++
          await this.backoff(attempt)
          continue
        }
        throw err
      }

      let response: Response
      try {
        response = await this.fetchImpl(this.baseUrl + path, { headers: { authorization: `Bearer ${token}` } })
      } catch (err) {
        if (attempt < MAX_ATTEMPTS) {
          attempt++
          await this.backoff(attempt)
          continue
        }
        throw new ApiError(0, [{ message: `GET file: ${(err as Error)?.message ?? String(err)}` }])
      }
      if (response.status === 401 && !reauthed) {
        reauthed = true
        await this.clearToken(token)
        continue
      }
      if (!response.ok) {
        if (canRetry('GET', response.status) && attempt < MAX_ATTEMPTS) {
          if (response.body) await response.body.cancel().catch(() => undefined)
          attempt++
          await this.backoff(attempt)
          continue
        }
        throw new ApiError(response.status, [{ message: `GET file -> ${response.status}` }])
      }
      try {
        return {
          bytes: await readBytesCapped(response, MAX_APPROVAL_FILE_BYTES),
          contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        }
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0
        if (canRetry('GET', status) && attempt < MAX_ATTEMPTS) {
          attempt++
          await this.backoff(attempt)
          continue
        }
        if (err instanceof ApiError) throw err
        throw new ApiError(0, [{ message: `GET file body: ${(err as Error)?.message ?? String(err)}` }])
      }
    }
  }

  // taskDoAction — task status transition (assigned -> accepted -> completed). A
  // direct status write is ignored; only doAction applies. checkTodos verifies open
  // todos before completing.
  async taskDoAction(taskId: string, action: TaskActionName, checkTodos: boolean): Promise<Task> {
    const body = { action, checkTodos }
    return this.do<Task>('POST', `/api/v3/task/${esc(taskId)}/doAction`, undefined, body)
  }

  // ── Transport (ported from megaplan.go) ────────────────────────────────────

  // do — one API call: auth, JSON params in the query string (APIv3: GET
  // /resource?{json}), 429/5xx/network retries, a single token re-issue on 401, and
  // {meta,data} unwrap.
  private async do<T>(method: Method, path: string, query: object | undefined, body: unknown | undefined): Promise<T> {
    const rawQuery = query === undefined ? '' : encodeURIComponent(JSON.stringify(query))
    const payload = body === undefined ? undefined : encodeBody(body)

    let reauthed = false
    for (let attempt = 1; ; ) {
      let token: string
      try {
        token = await this.accessToken()
      } catch (err) {
        // A transient failure of the token endpoint is retried — issuing a token
        // creates no entity. OAuth errors (invalid_grant) are permanent.
        const status = err instanceof ApiError ? err.status : 0
        if (transientStatus(status) && attempt < MAX_ATTEMPTS) {
          attempt++
          await this.backoff(attempt)
          continue
        }
        throw err
      }

      try {
        return await this.once<T>(method, path, rawQuery, payload, token)
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0
        if (status === 401 && !reauthed) {
          // The only documented signal of a stale token. A second 401 in a row is
          // no longer about the token — surface it (no infinite reauth loop).
          reauthed = true
          await this.clearToken(token)
          continue
        }
        if (canRetry(method, status) && attempt < MAX_ATTEMPTS) {
          attempt++
          await this.backoff(attempt)
          continue
        }
        throw err
      }
    }
  }

  private async once<T>(
    method: Method,
    path: string,
    rawQuery: string,
    payload: string | undefined,
    token: string
  ): Promise<T> {
    const url = this.baseUrl + path + (rawQuery ? `?${rawQuery}` : '')
    const headers: Record<string, string> = { authorization: `Bearer ${token}` }
    if (payload !== undefined) {
      headers['content-type'] = 'application/json'
    }

    let res: Response
    try {
      res = await this.fetchImpl(url, { method, headers, body: payload })
    } catch (err) {
      // Transport failure -> status 0 (transient): canRetry(GET, 0) is true.
      throw new ApiError(0, [{ message: `${method} ${path}: ${(err as Error)?.message ?? String(err)}` }])
    }

    const text = await readCapped(res, MAX_BODY_BYTES)
    if (res.status >= 400) {
      throw parseApiError(res.status, text)
    }
    // No-out callers (none today) would early-return here; every method awaits data.
    let wrapper: { data?: unknown }
    try {
      wrapper = JSON.parse(text) as { data?: unknown }
    } catch (err) {
      throw new ApiError(res.status, [{ message: `${method} ${path}: response envelope parse: ${(err as Error)?.message}` }])
    }
    return wrapper.data as T
  }

  // accessToken — cached token or a fresh password-grant issue. Serialized via an
  // in-flight promise (the Go mutex equivalent) so concurrent first calls do not
  // stampede the auth endpoint.
  private async accessToken(): Promise<string> {
    if (this.memToken) {
      return this.memToken
    }
    if (this.inflight) {
      return this.inflight
    }
    this.inflight = this.loadOrIssue()
    try {
      return await this.inflight
    } finally {
      this.inflight = null
    }
  }

  private async loadOrIssue(): Promise<string> {
    if (this.store) {
      const stored = await this.store.load()
      if (stored) {
        this.memToken = stored
        return stored
      }
    }
    const token = await this.issueToken()
    this.memToken = token
    if (this.store) {
      await this.store.save(token)
    }
    return token
  }

  // issueToken — password grant. Body is form-urlencoded: the docs show multipart,
  // urlencoded is the proven, simpler form. On a non-200 the endpoint replies with
  // the OAuth shape {error, error_description} (NOT the meta envelope); credentials
  // never reach the error text. The thrown ApiError carries the status so do()
  // separates a permanent OAuth error from a transient one.
  private async issueToken(): Promise<string> {
    const form = new URLSearchParams({ grant_type: 'password', username: this.username, password: this.password })
    let res: Response
    try {
      res = await this.fetchImpl(this.baseUrl + AUTH_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })
    } catch (err) {
      throw new ApiError(0, [{ message: `auth: ${(err as Error)?.message ?? String(err)}` }])
    }

    const text = await readCapped(res, MAX_BODY_BYTES)
    if (res.status !== 200) {
      let message = ''
      try {
        const oauth = JSON.parse(text) as { error?: string; error_description?: string }
        if (oauth.error) {
          message = `${oauth.error_description ?? ''} (${oauth.error})`.trim()
        }
      } catch {
        // non-JSON body: status alone is enough, never echo the body (may be large).
      }
      if (message) throw new ApiError(res.status, [{ message }])
      throw parseApiError(res.status, text)
    }

    let tok: { access_token?: string }
    try {
      tok = JSON.parse(text) as { access_token?: string }
    } catch (err) {
      throw new ApiError(res.status, [{ message: `auth: response parse: ${(err as Error)?.message}` }])
    }
    if (!tok.access_token) {
      throw new ApiError(res.status, [{ message: 'auth: empty access_token' }])
    }
    return tok.access_token
  }

  // clearToken drops the token only if it is still the one that went stale: a
  // concurrent call may have already re-issued a fresh one.
  private async clearToken(stale: string): Promise<void> {
    if (this.memToken === stale) {
      this.memToken = null
      if (this.store) {
        await this.store.clear()
      }
    }
  }

  private backoff(attempt: number): Promise<void> {
    // Exponential: the 2nd attempt waits retryDelay, then doubles per step.
    const delay = this.retryDelayMs << (attempt - 2)
    return new Promise((resolve) => setTimeout(resolve, delay))
  }
}

// esc — path-segment escape. Ids come from external data; a literal '/' must not
// split into extra path segments (encodeURIComponent('/') === '%2F').
function esc(id: string): string {
  return encodeURIComponent(id)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

function parseUploadedFile(text: string): FileRef {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new ApiError(200, [{ message: `POST /api/file: response parse: ${(err as Error)?.message}` }])
  }
  const wrapped = parsed as { data?: unknown }
  const data = wrapped?.data ?? parsed
  const candidate = Array.isArray(data) ? data[0] : data
  if (typeof candidate === 'string' || typeof candidate === 'number') {
    return { contentType: ContentType.File, id: String(candidate) }
  }
  const file = candidate as Partial<FileRef> | undefined
  if (!file?.id) throw new ApiError(200, [{ message: 'POST /api/file: response contains no file id' }])
  return { ...file, contentType: ContentType.File, id: String(file.id) }
}

// readCapped reads at most max bytes of the response and decodes them, stopping the
// stream once the cap is hit (the Go donor's io.LimitReader: error bodies carry
// MB-size trace blobs and an unbounded read is pointless). A null body (e.g. 204)
// decodes to "".
async function readCapped(res: Response, max: number): Promise<string> {
  if (res.body === null) {
    return ''
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < max) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    await reader.cancel()
  }
  const out = new Uint8Array(Math.min(total, max))
  let offset = 0
  for (const chunk of chunks) {
    const room = out.byteLength - offset
    if (room <= 0) {
      break
    }
    const take = chunk.byteLength > room ? chunk.subarray(0, room) : chunk
    out.set(take, offset)
    offset += take.byteLength
  }
  return new TextDecoder().decode(out)
}

export async function readBytesCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) throw fileTooLarge(max)
  if (res.body === null) return new Uint8Array()

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) throw fileTooLarge(max)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function fileTooLarge(max: number): ApiError {
  const mib = max / (1 << 20)
  return new ApiError(413, [{ message: `approval file exceeds the ${mib} MiB limit` }])
}

// parseApiError unwraps {"meta":{"errors":[{field,message,...}]}} and keeps ONLY
// field+message. type/internalType (Symfony class names) and trace (encrypted blob)
// are dropped — they must never be surfaced.
export function parseApiError(status: number, text: string): ApiError {
  let errors: { field?: string; message: string }[] = []
  try {
    const wrapper = JSON.parse(text) as { meta?: { errors?: { field?: string | null; message?: string }[] } }
    const raw = wrapper?.meta?.errors
    if (Array.isArray(raw)) {
      errors = raw
        .map((e) => ({ field: e?.field ?? undefined, message: String(e?.message ?? '') }))
        .filter((e) => e.message !== '' || e.field !== undefined)
    }
  } catch {
    // non-JSON error body: status alone, no blob.
  }
  return new ApiError(status, errors)
}
