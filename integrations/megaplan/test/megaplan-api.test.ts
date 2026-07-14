import { test, expect } from 'bun:test'
import { MegaplanApiClient } from '../src/megaplan-api'
import { ApiError, DateOnly, DateTime, Money, encodeBody, selectTransition } from '../src/types'

// Response shapes mirror live probes of m58160596.megaplan.ru: the token is an
// OAuth2 password grant, data is wrapped as {"meta":{...},"data":...}.
const TOKEN_OK = '{"access_token":"tok-1","expires_in":172800,"token_type":"bearer","scope":null,"refresh_token":"ref-1"}'
const AUTH_INVALID_GRANT = '{"error":"invalid_grant","error_description":"Invalid username and password combination"}'

const json = (status: number, body: string) => new Response(body, { status, headers: { 'content-type': 'application/json' } })
const wrap = (data: string) => `{"meta":{"status":200,"errors":[]},"data":${data}}`

type ApiHandler = (req: Request, body: string, url: URL) => Response | Promise<Response>
type AuthHandler = (form: URLSearchParams, callIndex: number) => Response
type FetchLike = (url: string, init: RequestInit) => Promise<Response>

type Env = {
  url: string
  authCalls: () => number
  apiCalls: () => number
  lastAuthForm: () => URLSearchParams | null
  stop: () => void
}

const envFetches = new Map<string, FetchLike>()
let envSeq = 0

function makeEnv(api: ApiHandler, auth?: AuthHandler): Env {
  let authCalls = 0
  let apiCalls = 0
  let lastAuthForm: URLSearchParams | null = null
  const url = `https://megaplan-test-${++envSeq}.local`
  const fetchImpl: FetchLike = async (requestUrl, init) => {
    const req = new Request(requestUrl, init)
    const parsed = new URL(req.url)
    if (parsed.pathname === '/api/v3/auth/access_token') {
      authCalls++
      lastAuthForm = new URLSearchParams(await req.text())
      return auth ? auth(lastAuthForm, authCalls) : json(200, TOKEN_OK)
    }
    apiCalls++
    return api(req, await req.text(), parsed)
  }
  envFetches.set(url, fetchImpl)
  return {
    url,
    authCalls: () => authCalls,
    apiCalls: () => apiCalls,
    lastAuthForm: () => lastAuthForm,
    stop: () => {
      envFetches.delete(url)
    },
  }
}

function newClient(url: string): MegaplanApiClient {
  return new MegaplanApiClient({
    baseUrl: url,
    username: 'bot@firm.ru',
    password: 's3cret',
    retryDelayMs: 1,
    fetchImpl: envFetches.get(url),
  })
}

async function withEnv(env: Env, fn: () => Promise<void>) {
  try {
    await fn()
  } finally {
    env.stop()
  }
}

test('constructor requires baseUrl/username/password', () => {
  expect(() => new MegaplanApiClient({ baseUrl: '', username: 'u', password: 'p' })).toThrow()
  expect(() => new MegaplanApiClient({ baseUrl: 'https://x.megaplan.ru', username: '', password: 'p' })).toThrow()
  expect(() => new MegaplanApiClient({ baseUrl: 'https://x.megaplan.ru', username: 'u', password: '' })).toThrow()
})

// Token issued lazily on first call, reused after — Megaplan recommends storing it.
test('token obtained once and reused', async () => {
  const env = makeEnv((req) => {
    expect(req.headers.get('authorization')).toBe('Bearer tok-1')
    return json(200, wrap('{"contentType":"Deal","id":"42"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await c.getDeal('42')
    await c.getDeal('42')
    expect(env.authCalls()).toBe(1)
    expect(env.apiCalls()).toBe(2)
    const form = env.lastAuthForm()!
    expect(form.get('grant_type')).toBe('password')
    expect(form.get('username')).toBe('bot@firm.ru')
    expect(form.get('password')).toBe('s3cret')
  })
})

// Bad creds: the OAuth error reaches the caller without retries; the password never
// appears in the error text.
test('auth bad credentials: permanent, no retry, password not leaked', async () => {
  const env = makeEnv(
    () => json(200, wrap('{}')),
    () => json(400, AUTH_INVALID_GRANT)
  )
  await withEnv(env, async () => {
    const c = newClient(env.url)
    let err: unknown
    try {
      await c.getDeal('1')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(400)
    expect((err as Error).message).toContain('Invalid username and password combination')
    expect((err as Error).message).not.toContain('s3cret')
    expect(env.authCalls()).toBe(1)
  })
})

// Transient token-endpoint failure (5xx) is retried: issuing a token creates no entity.
test('auth transient error retried', async () => {
  const env = makeEnv(
    () => json(200, wrap('{"contentType":"Deal","id":"42"}')),
    (_form, n) => (n === 1 ? json(500, '') : json(200, TOKEN_OK))
  )
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const d = await c.getDeal('42')
    expect(d.id).toBe('42')
    expect(env.authCalls()).toBe(2)
  })
})

// Stale token (401): re-issue and retry once, transparently.
test('reauth on 401', async () => {
  const env = makeEnv(
    (req) => {
      if (req.headers.get('authorization') === 'Bearer tok-1') {
        return json(401, '{"meta":{"status":401,"errors":[{"field":null,"message":"Unauthorized"}]},"data":{}}')
      }
      expect(req.headers.get('authorization')).toBe('Bearer tok-2')
      return json(200, wrap('{"contentType":"Deal","id":"7"}'))
    },
    (_form, n) => (n === 1 ? json(200, TOKEN_OK) : json(200, '{"access_token":"tok-2","token_type":"bearer"}'))
  )
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const d = await c.getDeal('7')
    expect(d.id).toBe('7')
    expect(env.authCalls()).toBe(2)
    expect(env.apiCalls()).toBe(2)
  })
})

// A second 401 with a fresh token is an error, not an infinite reauth loop.
test('reauth loop guard', async () => {
  const env = makeEnv(() => json(401, '{"meta":{"status":401,"errors":[{"field":null,"message":"Unauthorized"}]},"data":{}}'))
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await expect(c.getDeal('1')).rejects.toBeInstanceOf(ApiError)
    expect(env.authCalls()).toBeLessThanOrEqual(2)
    expect(env.apiCalls()).toBeLessThanOrEqual(2)
  })
})

test('createContractorHuman injects contentType discriminators', async () => {
  const env = makeEnv((req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/v3/contractorHuman')
    expect(req.headers.get('content-type')).toBe('application/json')
    const b = JSON.parse(body)
    expect(b.contentType).toBe('ContractorHuman')
    expect(b.firstName).toBe('Иван')
    expect(b.contactInfo[0].contentType).toBe('ContactInfo')
    expect(b.contactInfo[0].type).toBe('phone')
    return json(200, wrap('{"contentType":"ContractorHuman","id":"1000011","firstName":"Иван"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const created = await c.createContractorHuman({ firstName: 'Иван', contactInfo: [{ type: 'phone', value: '+79990000000' }] })
    expect(created.id).toBe('1000011')
  })
})

// List params go JSON-in-querystring (APIv3 quirk).
test('searchContractors encodes JSON params in the query', async () => {
  const env = makeEnv((req, _body, url) => {
    expect(req.method).toBe('GET')
    expect(url.pathname).toBe('/api/v3/contractor')
    const decoded = decodeURIComponent(url.search.slice(1))
    expect(JSON.parse(decoded)).toEqual({ q: '+79990000000', limit: 5 })
    return json(
      200,
      wrap('[{"contentType":"ContractorHuman","id":"1000011","firstName":"Иван"},{"contentType":"ContractorCompany","id":"1000012","name":"ООО Ромашка"}]')
    )
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const got = await c.searchContractors('+79990000000', 5)
    expect(got).toHaveLength(2)
    expect(got[0]!.firstName).toBe('Иван')
    expect(got[1]!.name).toBe('ООО Ромашка')
  })
})

// Money.value is a raw JSON NUMBER token straight from the decimal string (no float drift).
test('createDeal serializes Money as a precise number', async () => {
  const env = makeEnv((req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/v3/deal')
    const b = JSON.parse(body)
    expect(b.contentType).toBe('Deal')
    expect(b.program).toEqual({ contentType: 'Program', id: '3' })
    expect(b.price.contentType).toBe('Money')
    expect(b.price.currency).toBe('RUB')
    expect(b.price.rate).toBe(1)
    // The exact decimal literal must be present in the raw body, not a reformatted float.
    expect(body).toContain('"value":60000.50')
    expect(body).toContain('"valueInMain":60000.50')
    return json(200, wrap('{"contentType":"Deal","id":"77","number":"77","state":{"contentType":"ProgramState","id":"5","name":"Новый лид","type":"active"}}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const deal = await c.createDeal({
      programId: '3',
      contractorId: '1000011',
      description: 'Неустойка ДДУ, просрочка 120 дней',
      price: new Money('60000.50', 'RUB'),
    })
    expect(deal.id).toBe('77')
    expect(deal.state!.name).toBe('Новый лид')
  })
})

// Update = POST /deal/{id} with ONLY the changed fields (extras would overwrite the card).
test('updateDealFields sends only changed fields', async () => {
  const env = makeEnv((req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/v3/deal/77')
    const b = JSON.parse(body)
    expect(Object.keys(b).sort()).toEqual(['contentType', 'description'])
    return json(200, wrap('{"contentType":"Deal","id":"77","description":"x"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const deal = await c.updateDealFields('77', { description: 'x' })
    expect(deal.id).toBe('77')
  })
})

test('updateDealFields rejects an empty update', async () => {
  const env = makeEnv(() => json(200, wrap('{}')))
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await expect(c.updateDealFields('77', {})).rejects.toThrow(/at least one field/)
    expect(env.apiCalls()).toBe(0)
  })
})

test('listPrograms and programStates', async () => {
  const env = makeEnv((_req, _body, url) => {
    if (url.pathname === '/api/v3/program') {
      return json(200, wrap('[{"contentType":"Program","id":"3","name":"Неустойка ДДУ"}]'))
    }
    if (url.pathname === '/api/v3/program/3/states') {
      return json(
        200,
        wrap('[{"contentType":"ProgramState","id":"5","name":"Новый лид","type":"active","isEntry":true},{"contentType":"ProgramState","id":"9","name":"Выигран","type":"positive"}]')
      )
    }
    return json(404, '{}')
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const programs = await c.listPrograms()
    expect(programs[0]!.name).toBe('Неустойка ДДУ')
    const states = await c.programStates('3')
    expect(states[0]!.isEntry).toBe(true)
    expect(states[1]!.type).toBe('positive')
  })
})

test('addComment posts HTML content', async () => {
  const env = makeEnv((req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/v3/deal/77/comments')
    const b = JSON.parse(body)
    expect(b.contentType).toBe('Comment')
    expect(b.content).toBe('Диалог: https://t.me/c/123/77')
    return json(200, wrap('{"contentType":"Comment","id":"555"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const comment = await c.addComment('deal', '77', 'Диалог: https://t.me/c/123/77')
    expect(comment.id).toBe('555')
  })
})

test('createNegotiationTask creates a native approval with an immutable material version', async () => {
  const env = makeEnv((req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/v3/task')
    const b = JSON.parse(body)
    expect(b.isNegotiation).toBe(true)
    expect(b.negotiationExecutors).toEqual([{ contentType: 'Employee', id: 'E2' }])
    expect(b.negotiationItems[0].actualVersion.text).toContain('sha256:abc123')
    expect(b.negotiationItems[0].actualVersion.attache).toEqual({ contentType: 'File', id: 'F1' })
    return json(
      200,
      wrap(
        '{"contentType":"Task","id":"T9","isNegotiation":true,"negotiationItems":[{"contentType":"NegotiationItem","id":"N1","actualVersion":{"contentType":"NegotiationItemVersion","id":"V1","status":"not_rated"}}]}'
      )
    )
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const task = await c.createNegotiationTask({
      name: 'Согласовать претензию',
      responsibleId: 'E1',
      approverIds: ['E2'],
      dealIds: ['D1'],
      materialSha256: 'abc123',
      materialName: 'claim.docx',
      materialFile: { contentType: 'File', id: 'F1' },
    })
    expect(task.id).toBe('T9')
    expect(task.negotiationItems?.[0]?.id).toBe('N1')
  })
})

test('uploadFile sends multipart files[] and returns the uploaded Megaplan file', async () => {
  const env = makeEnv(async (req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/file')
    expect(req.headers.get('authorization')).toBe('Bearer tok-1')
    expect(req.headers.get('content-type')).toStartWith('multipart/form-data; boundary=')
    expect(body).toContain('name="files[]"; filename="claim.docx"')
    expect(body).toContain('claim-v1')
    return json(200, wrap('[{"contentType":"File","id":"F1","name":"claim.docx","path":"/attach/claim.docx"}]'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const file = await c.uploadFile('claim.docx', new TextEncoder().encode('claim-v1'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(file).toEqual({ contentType: 'File', id: 'F1', name: 'claim.docx', path: '/attach/claim.docx' })
  })
})

test('downloadFile retries 429 and 5xx before returning bytes', async () => {
  let n = 0
  const env = makeEnv((_req, _body, url) => {
    expect(url.pathname).toBe('/attach/approved.docx')
    n++
    if (n === 1) return new Response('', { status: 429 })
    if (n === 2) return new Response('', { status: 503 })
    return new Response('approved-v2', { headers: { 'content-type': 'application/docx' } })
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const file = await c.downloadFile('/attach/approved.docx')
    expect(new TextDecoder().decode(file.bytes)).toBe('approved-v2')
    expect(file.contentType).toBe('application/docx')
    expect(env.apiCalls()).toBe(3)
  })
})

test('downloadFile rejects oversized approved versions before buffering them', async () => {
  const env = makeEnv(() => new Response('x', {
    headers: { 'content-length': String((20 << 20) + 1) },
  }))
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await expect(c.downloadFile('/attach/approved.docx')).rejects.toThrow(/exceeds.*20 MiB/i)
    expect(env.apiCalls()).toBe(1)
  })
})

test('getNegotiationDecision reads the aggregate status and human visa from the actual version', async () => {
  const env = makeEnv((req, _body, url) => {
    expect(req.method).toBe('GET')
    expect(url.pathname).toBe('/api/v3/task/T9/negotiationItems')
    return json(
      200,
      wrap(
        '[{"contentType":"NegotiationItem","id":"N1","actualVersion":{"contentType":"NegotiationItemVersion","id":"V2","status":"ok","attache":{"contentType":"File","id":"F2","path":"/attach/claim-v2.docx","name":"claim-v2.docx"},"visas":[{"contentType":"NegotiationVisa","id":"Z1","status":"ok","userCreated":{"contentType":"Employee","id":"E2","name":"Анна"}}]}}]'
      )
    )
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const decision = await c.getNegotiationDecision('T9')
    expect(decision).toEqual({
      status: 'approved',
      itemId: 'N1',
      versionId: 'V2',
      fileId: 'F2',
      filePath: '/attach/claim-v2.docx',
      fileName: 'claim-v2.docx',
      actorId: 'E2',
      actorName: 'Анна',
    })
  })
})

// API error: only field+message surface; the trace blob is dropped.
test('API error exposes field+message, never the trace blob', async () => {
  const env = makeEnv(() =>
    json(
      422,
      '{"meta":{"status":422,"errors":[{"field":"program","type":"ValidationException","message":"Поле обязательно","trace":["SECRET-TRACE-BLOB"]}]},"data":{}}'
    )
  )
  await withEnv(env, async () => {
    const c = newClient(env.url)
    let err: unknown
    try {
      await c.createDeal({ programId: '3' })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(422)
    expect((err as Error).message).toContain('program')
    expect((err as Error).message).toContain('Поле обязательно')
    expect((err as Error).message).not.toContain('SECRET-TRACE-BLOB')
  })
})

// 429 (any method) and 5xx (GET) are retried with backoff.
test('GET retried on 429 then 5xx then ok', async () => {
  let n = 0
  const env = makeEnv(() => {
    n++
    if (n === 1) return json(429, '')
    if (n === 2) return json(500, '')
    return json(200, wrap('{"contentType":"Deal","id":"42"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const d = await c.getDeal('42')
    expect(d.id).toBe('42')
    expect(env.apiCalls()).toBe(3)
  })
})

// Creation is NOT idempotent: a POST is not retried on 5xx (would duplicate the entity).
test('createDeal not retried on 5xx', async () => {
  const env = makeEnv(() => json(500, ''))
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await expect(c.createDeal({ programId: '3' })).rejects.toBeInstanceOf(ApiError)
    expect(env.apiCalls()).toBe(1)
  })
})

// 429 is safe for POST too (the limiter rejects before processing).
test('createDeal retried on 429', async () => {
  let n = 0
  const env = makeEnv(() => {
    n++
    return n === 1 ? json(429, '') : json(200, wrap('{"contentType":"Deal","id":"77"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const deal = await c.createDeal({ programId: '3' })
    expect(deal.id).toBe('77')
    expect(env.apiCalls()).toBe(2)
  })
})

test('GET retry exhausted at 3 attempts', async () => {
  const env = makeEnv(() => json(500, ''))
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await expect(c.getDeal('42')).rejects.toBeInstanceOf(ApiError)
    expect(env.apiCalls()).toBe(3)
  })
})

test('no retry on client error (422 GET)', async () => {
  const env = makeEnv(() => json(422, '{"meta":{"status":422,"errors":[{"message":"bad"}]},"data":{}}'))
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await expect(c.getDeal('42')).rejects.toBeInstanceOf(ApiError)
    expect(env.apiCalls()).toBe(1)
  })
})

// Path ids are escaped: a literal '/' must not split into extra path segments.
test('path id is escaped', async () => {
  let gotPath = ''
  const env = makeEnv((_req, _body, url) => {
    gotPath = url.pathname
    return json(404, '{"meta":{"status":404,"errors":[{"message":"not found"}]},"data":{}}')
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await expect(c.getDeal('42/extra')).rejects.toBeInstanceOf(ApiError)
    expect(gotPath).toBe('/api/v3/deal/42%2Fextra')
  })
})

test('getDeal parses possibleTransitions; selectTransition matches by to.id', async () => {
  const dealJSON =
    '{"contentType":"Deal","id":"16","state":{"contentType":"ProgramState","id":"73"},' +
    '"possibleTransitions":[' +
    '{"contentType":"ProgramTransition","id":"64","to":{"contentType":"ProgramState","id":"72","name":"Заявка","color":"#fff"},"reasons":[],"enabled":true},' +
    '{"contentType":"ProgramTransition","id":"66","to":{"contentType":"ProgramState","id":"74","name":"Расчёт и оферта"},"reasons":[],"enabled":true}]}'
  const env = makeEnv((_req, _body, url) => {
    expect(url.pathname).toBe('/api/v3/deal/16')
    return json(200, wrap(dealJSON))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const d = await c.getDeal('16')
    expect(d.possibleTransitions).toHaveLength(2)
    const raw = selectTransition(d.possibleTransitions, '74')
    expect(raw).not.toBeNull()
    expect((raw as { id: string }).id).toBe('66')
    expect(selectTransition(d.possibleTransitions, '999')).toBeNull()
  })
})

// applyTransition posts the raw transition VERBATIM (the account-specific nested
// fields, e.g. color, must survive).
test('applyTransition posts the transition verbatim', async () => {
  const raw = { contentType: 'ProgramTransition', id: '66', to: { contentType: 'ProgramState', id: '74', color: '#abc' }, reasons: [], enabled: true }
  let gotBody = ''
  const env = makeEnv((req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/v3/deal/16/applyTransition')
    gotBody = body
    return json(200, wrap('{"contentType":"Deal","id":"16","state":{"contentType":"ProgramState","id":"74"}}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const d = await c.applyTransition('16', raw)
    expect(d.state!.id).toBe('74')
    expect(JSON.parse(gotBody)).toEqual(raw)
    expect(gotBody).toContain('"color":"#abc"')
  })
})

// moveDealStage: getDeal -> select -> applyTransition; no-op when no transition to target.
test('moveDealStage applies the matched transition', async () => {
  const dealJSON =
    '{"contentType":"Deal","id":"16","possibleTransitions":[{"contentType":"ProgramTransition","id":"66","to":{"contentType":"ProgramState","id":"74","color":"#abc"}}]}'
  let posted = false
  const env = makeEnv((req, _body, url) => {
    if (req.method === 'GET' && url.pathname === '/api/v3/deal/16') return json(200, wrap(dealJSON))
    if (req.method === 'POST' && url.pathname === '/api/v3/deal/16/applyTransition') {
      posted = true
      return json(200, wrap('{"contentType":"Deal","id":"16","state":{"contentType":"ProgramState","id":"74","name":"Расчёт"}}'))
    }
    return json(404, '{}')
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const res = await c.moveDealStage('16', '74')
    expect(res.moved).toBe(true)
    expect(res.deal.state!.id).toBe('74')
    expect(posted).toBe(true)
  })
})

test('moveDealStage fails when no transition leads to the target', async () => {
  const dealJSON =
    '{"contentType":"Deal","id":"16","state":{"contentType":"ProgramState","id":"73"},"possibleTransitions":[{"contentType":"ProgramTransition","id":"66","to":{"contentType":"ProgramState","id":"74"}}]}'
  let posted = false
  const env = makeEnv((req, _body, url) => {
    if (req.method === 'GET' && url.pathname === '/api/v3/deal/16') return json(200, wrap(dealJSON))
    posted = true
    return json(200, wrap('{}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await expect(c.moveDealStage('16', '999')).rejects.toThrow(/no transition/)
    expect(posted).toBe(false)
  })
})

test('createTodo attaches via the deal sub-resource', async () => {
  const env = makeEnv((req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/v3/deal/16/todos')
    const b = JSON.parse(body)
    expect(b.contentType).toBe('Todo')
    expect(b.name).toBe('Собрать сканы ДДУ')
    expect(b.responsible).toEqual({ contentType: 'Employee', id: '1000004' })
    return json(200, wrap('{"contentType":"Todo","id":"14"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const todo = await c.createTodo('16', 'Собрать сканы ДДУ', '1000004')
    expect(todo.id).toBe('14')
  })
})

test('listTodos finished filter: false sends it, undefined omits it', async () => {
  let lastQuery = ''
  const env = makeEnv((_req, _body, url) => {
    lastQuery = url.search ? decodeURIComponent(url.search.slice(1)) : ''
    return json(200, wrap('[{"contentType":"Todo","id":"14"}]'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await c.listTodos('16', false)
    expect(lastQuery).toContain('"finished":false')
    await c.listTodos('16')
    expect(lastQuery).not.toContain('finished')
  })
})

test('finishTodo posts the fixed action request', async () => {
  const env = makeEnv((req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/v3/todo/14/doAction')
    expect(JSON.parse(body).contentType).toBe('TodoFinishActionRequest')
    return json(200, wrap('{"contentType":"Todo","id":"14"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await c.finishTodo('14')
  })
})

test('createTask: isTemplate/isUrgent present at false, deals linked, no deadline', async () => {
  const env = makeEnv((req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/v3/task')
    const b = JSON.parse(body)
    expect(b.contentType).toBe('Task')
    expect(b.isTemplate).toBe(false)
    expect(b.isUrgent).toBe(false)
    expect(b.responsible).toEqual({ contentType: 'Employee', id: '1000003' })
    expect(b.deals).toEqual([{ contentType: 'Deal', id: '16' }])
    expect('deadline' in b).toBe(false)
    return json(200, wrap('{"contentType":"Task","id":"1000013","status":"assigned"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const task = await c.createTask({ name: 'Клиент не присылает сканы — дело #5', responsibleId: '1000003', dealIds: ['16'] })
    expect(task.id).toBe('1000013')
    expect(task.status).toBe('assigned')
  })
})

test('createTask with deadline serializes DateTime', async () => {
  const env = makeEnv((_req, body) => {
    const b = JSON.parse(body)
    expect(b.deadline).toEqual({ contentType: 'DateTime', value: '2026-06-22 12:00:00' })
    return json(200, wrap('{"contentType":"Task","id":"1"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await c.createTask({ name: 'x', responsibleId: '1', dealIds: [], deadline: new DateTime('2026-06-22 12:00:00') })
  })
})

test('taskDoAction posts action + checkTodos', async () => {
  const env = makeEnv((req, body, url) => {
    expect(req.method).toBe('POST')
    expect(url.pathname).toBe('/api/v3/task/1000013/doAction')
    const b = JSON.parse(body)
    expect(b.action).toBe('act_done')
    expect(b.checkTodos).toBe(true)
    return json(200, wrap('{"contentType":"Task","id":"1000013","status":"completed"}'))
  })
  await withEnv(env, async () => {
    const c = newClient(env.url)
    const task = await c.taskDoAction('1000013', 'act_done', true)
    expect(task.status).toBe('completed')
  })
})

test('createTask not retried on 5xx', async () => {
  const env = makeEnv(() => json(502, '{"meta":{"status":502,"errors":[{"message":"bad gateway"}]}}'))
  await withEnv(env, async () => {
    const c = newClient(env.url)
    await expect(c.createTask({ name: 'x', responsibleId: '1', dealIds: [] })).rejects.toBeInstanceOf(ApiError)
    expect(env.apiCalls()).toBe(1)
  })
})

// Pure serialization units (no server).
test('Money rejects a non-decimal value', () => {
  expect(() => new Money('not-a-number')).toThrow()
  expect(() => new Money('12.5')).not.toThrow()
})

test('DateTime rejects a non-conforming value', () => {
  expect(() => new DateTime('2026-06-22T12:00:00')).toThrow()
  expect(() => new DateTime('2026-06-22 12:00:00')).not.toThrow()
})

test('DateOnly rejects invalid dates and stores Megaplan zero-based month', () => {
  expect(() => new DateOnly('2026-02-30')).toThrow()
  const date = new DateOnly('2026-06-22')
  expect(date.year).toBe(2026)
  expect(date.month).toBe(5)
  expect(date.day).toBe(22)
})

test('encodeBody emits Money as a raw number, DateTime as a spaced string and DateOnly with zero-based month', () => {
  const out = encodeBody({
    price: new Money('1000.00'),
    at: new DateTime('2026-01-02 03:04:05'),
    birthday: new DateOnly('2026-06-22'),
  })
  expect(out).toContain('"value":1000.00')
  expect(out).toContain('"valueInMain":1000.00')
  expect(out).toContain('"rate":1')
  expect(out).toContain('"value":"2026-01-02 03:04:05"')
  expect(out).toContain('"birthday":{"contentType":"DateOnly","year":2026,"month":5,"day":22}')
})
