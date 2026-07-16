import { describe, expect, test } from 'bun:test'
import {
  TerritorialJurisdictionApiError,
  TerritorialJurisdictionClient,
} from '../src/territorial-jurisdiction-api'

type Recorded = {
  url: URL
  method: string
  headers: Headers
}

type HandlerResult = Response | Promise<Response>

function makeFetch(handler: (request: Recorded, attempt: number) => HandlerResult) {
  const calls: Recorded[] = []
  let attempt = 0
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input.toString(), init)
    const recorded = {
      url: new URL(request.url),
      method: request.method,
      headers: request.headers,
    }
    calls.push(recorded)
    return handler(recorded, attempt++)
  }) as typeof fetch
  return { impl, calls }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const searchSuccess = {
  data: { last: 49, status: 1 },
  request: {
    address: 'Москва, Тверская, 1',
    coords: null,
    court_fs: {
      code: '77RS0023',
      title: 'Савеловский районный суд',
      address: 'г. Москва, ул. Бутырский вал, д. 7',
      site: 'https://example.test/one https://example.test/two',
      email: 'one@example.test two@example.test',
      tel: '(499) 000-00-00',
    },
    court_ms: null,
  },
}

describe('TerritorialJurisdictionClient: поиск', () => {
  test('использует /v1/, кодирует токен и адрес, преобразует названия полей', async () => {
    const { impl, calls } = makeFetch(() => json(searchSuccess))
    const client = new TerritorialJurisdictionClient({
      token: 'secret + token',
      baseUrl: 'https://api.example.test',
      fetchImpl: impl,
    })

    const result = await client.findByAddress('  Москва, Тверская, 1  ')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url.pathname).toBe('/v1/')
    expect(calls[0]!.url.searchParams.get('token')).toBe('secret + token')
    expect(calls[0]!.url.searchParams.get('address')).toBe('Москва, Тверская, 1')
    expect(calls[0]!.url.searchParams.has('coords')).toBe(false)
    expect(calls[0]!.headers.has('authorization')).toBe(false)
    expect(result.remaining).toBe(49)
    expect(result.districtCourt?.code).toBe('77RS0023')
    expect(result.districtCourt?.site).toContain('https://example.test/two')
    expect(result.magistrateCourt).toBeNull()
    expect(result.resolvedCoordinates).toBeNull()
  })

  test('передаёт координаты в формате «широта долгота»', async () => {
    const body = {
      ...searchSuccess,
      request: { ...searchSuccess.request, address: null, coords: '55.7558 37.6173' },
    }
    const { impl, calls } = makeFetch(() => json(body))
    const client = new TerritorialJurisdictionClient({ token: 't', baseUrl: 'https://api.example.test', fetchImpl: impl })

    const result = await client.findByCoordinates(55.7558, 37.6173)

    expect(calls[0]!.url.searchParams.get('coords')).toBe('55.7558 37.6173')
    expect(calls[0]!.url.searchParams.has('address')).toBe(false)
    expect(result.resolvedCoordinates).toBe('55.7558 37.6173')
  })

  test('отклоняет пустой адрес и координаты вне диапазона до сети', async () => {
    const { impl, calls } = makeFetch(() => json(searchSuccess))
    const client = new TerritorialJurisdictionClient({ token: 't', fetchImpl: impl })

    await expect(client.findByAddress('   ')).rejects.toThrow(/не должен быть пустым/)
    await expect(client.findByCoordinates(91, 37)).rejects.toThrow(/Широта/)
    await expect(client.findByCoordinates(55, Number.NaN)).rejects.toThrow(/Долгота/)
    expect(calls).toHaveLength(0)
  })

  test('постоянная бизнес-ошибка не ретраится', async () => {
    const { impl, calls } = makeFetch(() => json({ data: { status: 0, error: 'Токен недействителен' } }))
    const client = new TerritorialJurisdictionClient({
      token: 'bad',
      fetchImpl: impl,
      retryDelayMs: 1,
    })

    await expect(client.findByAddress('Москва, Тверская, 1')).rejects.toThrow('Токен недействителен')
    expect(calls).toHaveLength(1)
  })

  test('временная ошибка геокодера ретраится и затем возвращает результат', async () => {
    const { impl, calls } = makeFetch((_request, attempt) =>
      attempt === 0
        ? json({ data: { status: 0, error: 'Не удалось получить данные геокодера' } })
        : json(searchSuccess),
    )
    const client = new TerritorialJurisdictionClient({ token: 't', fetchImpl: impl, retryDelayMs: 1 })

    const result = await client.findByAddress('Москва, Тверская, 1')

    expect(result.remaining).toBe(49)
    expect(calls).toHaveLength(2)
  })

  test('HTTP 5xx ретраится, HTTP 4xx завершается сразу', async () => {
    const retrying = makeFetch((_request, attempt) =>
      attempt === 0 ? json({ message: 'temporary' }, 503) : json(searchSuccess),
    )
    const retryingClient = new TerritorialJurisdictionClient({
      token: 't',
      fetchImpl: retrying.impl,
      retryDelayMs: 1,
    })
    await retryingClient.findByAddress('Москва, Тверская, 1')
    expect(retrying.calls).toHaveLength(2)

    const permanent = makeFetch(() => json({ message: 'forbidden' }, 403))
    const permanentClient = new TerritorialJurisdictionClient({ token: 't', fetchImpl: permanent.impl, retryDelayMs: 1 })
    await expect(permanentClient.findByAddress('Москва, Тверская, 1')).rejects.toThrow('forbidden')
    expect(permanent.calls).toHaveLength(1)
  })

  test('токен вычищается из ошибок поставщика', async () => {
    const token = 'super-secret-token'
    const { impl } = makeFetch(() => json({ data: { status: 0, error: `Ошибка для ${token}` } }))
    const client = new TerritorialJurisdictionClient({ token, fetchImpl: impl })

    let error: unknown
    try {
      await client.findByAddress('Москва, Тверская, 1')
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(TerritorialJurisdictionApiError)
    expect((error as Error).message).toContain('[REDACTED]')
    expect((error as Error).message).not.toContain(token)
  })

  test('отклоняет неожиданный или слишком большой ответ', async () => {
    const malformed = makeFetch(() => json({ data: { status: 1, last: '49' }, request: {} }))
    const malformedClient = new TerritorialJurisdictionClient({ token: 't', fetchImpl: malformed.impl })
    await expect(malformedClient.findByAddress('Москва, Тверская, 1')).rejects.toThrow(/data.last/)

    const oversized = makeFetch(() => new Response('x'.repeat((1 << 20) + 1), { status: 200 }))
    const oversizedClient = new TerritorialJurisdictionClient({ token: 't', fetchImpl: oversized.impl })
    await expect(oversizedClient.findByAddress('Москва, Тверская, 1')).rejects.toThrow(/лимит размера/)
  })
})

describe('TerritorialJurisdictionClient: аккаунт', () => {
  test('нормализует фактический ответ free-аккаунта', async () => {
    const { impl, calls } = makeFetch(() =>
      json({
        name: 'Иван',
        email: 'ivan@example.test',
        blocking: 0,
        balance: null,
        tariff: 'free',
        price: null,
        count_last: 48,
        count_max: 50,
      }),
    )
    const client = new TerritorialJurisdictionClient({ token: 't', baseUrl: 'https://api.example.test', fetchImpl: impl })

    const account = await client.getAccount()

    expect(calls[0]!.url.pathname).toBe('/v1/account')
    expect(account).toEqual({
      name: 'Иван',
      email: 'ivan@example.test',
      blocked: false,
      balance: null,
      tariff: 'free',
      price: null,
      remainingRequests: 48,
      dailyLimit: 50,
    })
  })

  test('нормализует blocking=1 и отклоняет другие числовые значения', async () => {
    const account = {
      name: 'Иван',
      email: 'ivan@example.test',
      balance: 100,
      tariff: 'balance',
      price: 1,
      count_last: null,
      count_max: null,
    }
    const enabled = makeFetch(() => json({ ...account, blocking: 1 }))
    const invalid = makeFetch(() => json({ ...account, blocking: 2 }))

    await expect(new TerritorialJurisdictionClient({ token: 't', fetchImpl: enabled.impl }).getAccount()).resolves.toMatchObject({
      blocked: true,
      balance: 100,
    })
    await expect(new TerritorialJurisdictionClient({ token: 't', fetchImpl: invalid.impl }).getAccount()).rejects.toThrow(
      /blocking/,
    )
  })

  test('ошибочный envelope аккаунта обрабатывается как ошибка API', async () => {
    const { impl } = makeFetch(() => json({ data: { status: 0, error: 'Доступ к API заблокирован' } }))
    const client = new TerritorialJurisdictionClient({ token: 't', fetchImpl: impl })

    await expect(client.getAccount()).rejects.toThrow('Доступ к API заблокирован')
  })
})
