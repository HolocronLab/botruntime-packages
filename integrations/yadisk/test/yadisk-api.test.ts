// Юнит-тесты клиента Диска на инъекции fetch (реальные Response). Порт интента
// ts/lawyer-bot/src/clients/yadisk.test.ts + новые инварианты из Go: ретраи со
// свежим href, токен не уходит на сторадж и не течёт в текст ошибки, stat.
import { describe, expect, test } from 'bun:test'
import { YadiskApiError, YadiskClient, ancestorDirs } from '../src/yadisk-api'
import { resolveAppPath } from '../src/paths'

type Recorded = { url: string; method: string; hasAuth: boolean }

// makeFetch — fetch-двойник, отдающий реальные Response (тело-стрим читается
// клиентом как в проде). handler(url, attempt) выбирает ответ; attempt — 0-based
// индекс вызова, чтобы моделировать транзиентный сбой.
function makeFetch(handler: (url: string, attempt: number) => { status: number; body?: string | Uint8Array }) {
  const calls: Recorded[] = []
  let attempt = 0
  const impl = (async (url: any, init?: any) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')
    calls.push({ url: String(url), method: init?.method ?? 'GET', hasAuth })
    const r = handler(String(url), attempt++)
    return new Response(r.body ?? '', { status: r.status })
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('YadiskClient', () => {
  test('upload: GET href → PUT байтов (overwrite, путь закодирован, токен не уходит на сторадж)', async () => {
    const { impl, calls } = makeFetch((url) =>
      url.includes('/resources/upload')
        ? { status: 200, body: JSON.stringify({ href: 'https://storage.example/put?sig=1' }) }
        : { status: 201 },
    )
    const c = new YadiskClient({ token: 't', fetchImpl: impl })
    await c.upload('app:/ddu/1.pdf', new Uint8Array([1, 2, 3]), { mimeType: 'application/pdf' })

    expect(calls.length).toBe(2)
    expect(calls[0].url).toContain('overwrite=true')
    expect(calls[0].url).toContain('path=app%3A%2Fddu%2F1.pdf')
    expect(calls[0].hasAuth).toBe(true) // cloud-api → OAuth
    expect(calls[1].method).toBe('PUT')
    expect(calls[1].url).toBe('https://storage.example/put?sig=1')
    expect(calls[1].hasAuth).toBe(false) // хост-сторадж → токен НЕ шлём
  })

  test('verify: GET /resources на app:/ (scope app_folder), не корень /v1/disk', async () => {
    const { impl, calls } = makeFetch(() => ({ status: 200, body: JSON.stringify({ path: 'disk:/Приложения/MP' }) }))
    const c = new YadiskClient({ token: 't', fetchImpl: impl })
    await c.verify()

    expect(calls.length).toBe(1)
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toContain('/resources?')
    expect(calls[0].url).toContain('path=app%3A%2F')
    expect(calls[0].url).not.toMatch(/\/v1\/disk(\?|$)/) // не дёргаем корень Диска (403 на app_folder)
    expect(calls[0].hasAuth).toBe(true)
  })

  test('mkdirAll: 409 терпится (идемпотентно), посегментно', async () => {
    const { impl, calls } = makeFetch(() => ({ status: 409 }))
    const c = new YadiskClient({ token: 't', fetchImpl: impl })
    await c.mkdirAll('app:/lead-1/case-2')

    expect(calls.length).toBe(2) // app:/lead-1, app:/lead-1/case-2
    expect(calls.every((x) => x.method === 'PUT')).toBe(true)
    expect(calls[0].url).toContain('path=app%3A%2Flead-1')
  })

  test('upload: 5xx на стораже ретраится со СВЕЖИМ href, затем успех', async () => {
    let put = 0
    const { impl, calls } = makeFetch((url) => {
      if (url.includes('/resources/upload')) {
        return { status: 200, body: JSON.stringify({ href: `https://storage.example/put?try=${put}` }) }
      }
      put++
      return put === 1 ? { status: 500 } : { status: 201 }
    })
    const c = new YadiskClient({ token: 't', fetchImpl: impl, retryDelayMs: 1 })
    await c.upload('app:/x.pdf', new Uint8Array([1]))

    const hrefGets = calls.filter((x) => x.url.includes('/resources/upload'))
    const puts = calls.filter((x) => x.method === 'PUT' && x.url.startsWith('https://storage'))
    expect(hrefGets.length).toBe(2) // href пере-запрошен на ретрае
    expect(puts.length).toBe(2)
    expect(puts[0].url).not.toBe(puts[1].url) // href одноразовый — свежий на ретрае
  })

  test('4xx не ретрается, токен не в тексте ошибки, сообщение из тела', async () => {
    const { impl, calls } = makeFetch(() => ({ status: 404, body: JSON.stringify({ message: 'не найдено' }) }))
    const c = new YadiskClient({ token: 'super-secret', fetchImpl: impl, retryDelayMs: 1 })

    let err: unknown
    try {
      await c.download('app:/missing')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(YadiskApiError)
    expect((err as YadiskApiError).status).toBe(404)
    expect(String((err as Error).message)).toContain('не найдено')
    expect(String((err as Error).message)).not.toContain('super-secret')
    expect(calls.length).toBe(1) // download href, без ретраев
  })

  test('пустой токен → fail-loud в конструкторе', () => {
    expect(() => new YadiskClient({ token: '' })).toThrow(/токен/)
  })

  test('download: GET href → GET байтов (токен не уходит на сторадж)', async () => {
    const { impl, calls } = makeFetch((url) =>
      url.includes('/resources/download')
        ? { status: 200, body: JSON.stringify({ href: 'https://storage.example/get?sig=2' }) }
        : { status: 200, body: new Uint8Array([9, 8, 7]) },
    )
    const c = new YadiskClient({ token: 't', fetchImpl: impl })
    const data = await c.download('app:/ddu/1.pdf')

    expect(Array.from(data)).toEqual([9, 8, 7])
    expect(calls[1].url).toBe('https://storage.example/get?sig=2')
    expect(calls[1].hasAuth).toBe(false)
  })

  test('publish: PUT /resources/publish с OAuth', async () => {
    const { impl, calls } = makeFetch(() => ({ status: 200, body: JSON.stringify({ href: 'x' }) }))
    const c = new YadiskClient({ token: 't', fetchImpl: impl })
    await c.publish('app:/lead-1/case-2')

    expect(calls.length).toBe(1)
    expect(calls[0].method).toBe('PUT')
    expect(calls[0].url).toContain('/resources/publish?')
    expect(calls[0].url).toContain('path=app%3A%2Flead-1%2Fcase-2')
    expect(calls[0].hasAuth).toBe(true)
  })

  test('stat: fields=public_url,path & limit=0, парсит ссылку и путь', async () => {
    const { impl, calls } = makeFetch(() => ({
      status: 200,
      body: JSON.stringify({ path: 'disk:/Приложения/MP/lead-1', public_url: 'https://yadi.sk/d/abc' }),
    }))
    const c = new YadiskClient({ token: 't', fetchImpl: impl })
    const meta = await c.stat('app:/lead-1')

    expect(meta.publicUrl).toBe('https://yadi.sk/d/abc')
    expect(meta.path).toBe('disk:/Приложения/MP/lead-1')
    expect(calls[0].url).toContain('fields=public_url%2Cpath')
    expect(calls[0].url).toContain('limit=0')
  })

  test('транзиентный 5xx ретрается (stat), пустой public_url до publish', async () => {
    const { impl, calls } = makeFetch((_url, attempt) =>
      attempt === 0
        ? { status: 503, body: JSON.stringify({ message: 'temporarily unavailable' }) }
        : { status: 200, body: JSON.stringify({ path: 'disk:/x', public_url: '' }) },
    )
    const c = new YadiskClient({ token: 't', fetchImpl: impl, retryDelayMs: 1 })
    const meta = await c.stat('app:/x')

    expect(meta.path).toBe('disk:/x')
    expect(meta.publicUrl).toBe('')
    expect(calls.length).toBe(2)
  })
})

describe('ancestorDirs', () => {
  test('строит цепочку предков; корень схемы не создаём', () => {
    expect(ancestorDirs('app:/a/b/c')).toEqual(['app:/a', 'app:/a/b', 'app:/a/b/c'])
    expect(ancestorDirs('app:/ddu')).toEqual(['app:/ddu'])
    expect(ancestorDirs('app:/')).toEqual([])
    expect(ancestorDirs('disk:/x/y')).toEqual(['disk:/x', 'disk:/x/y'])
  })
})

describe('resolveAppPath', () => {
  test('навешивает app:/<folder>/ на относительный путь', () => {
    expect(resolveAppPath('cases', 'lead-1/case-2/ddu/doc.jpg')).toBe('app:/cases/lead-1/case-2/ddu/doc.jpg')
    expect(resolveAppPath('', 'lead-1/x.pdf')).toBe('app:/lead-1/x.pdf')
    expect(resolveAppPath('a/b', '/c/d/')).toBe('app:/a/b/c/d')
  })

  test('запрещает абсолютные схемы и dot-сегменты', () => {
    expect(() => resolveAppPath('cases', 'app:/already/abs')).toThrow(/относительный/)
    expect(() => resolveAppPath('cases', 'disk:/already/abs')).toThrow(/относительный/)
    expect(() => resolveAppPath('../cases', 'lead-1/x.pdf')).toThrow(/запрещены/)
    expect(() => resolveAppPath('cases', 'lead-1/../x.pdf')).toThrow(/запрещены/)
  })
})
