// Клиент Яндекс.Диск REST API. Порт ts/lawyer-bot/src/clients/yadisk.ts с кросс-
// чеком Go api/internal/clients/yadisk — добавлены ретраи, таймаут, разбор
// сообщения ошибки и Stat (в TS-доноре его не было, а без него не прочитать
// публичную ссылку). Pure-модуль без @botpress/sdk — юнит-тестируем напрямую.
//
// Инварианты (нарушать нельзя):
//  - Авторизация — заголовок `OAuth <token>`, НЕ Bearer (схема Яндекса).
//  - upload/download двухшаговые: GET href у cloud-api → перенос байтов на
//    хост-сторадж по этому href. На хост-сторадж токен НЕ уходит (href уже
//    подписан) — иначе секрет утёк бы за пределы cloud-api.
//  - href одноразовый: на ретрае берём свежий (весь двухшаг внутри retry).
//  - mkdir идемпотентен: 409 (каталог уже есть) = успех.
//  - ретраи только на транзиентных (0/429/5xx); прочие 4xx — сразу наружу.
//  - токен живёт только в заголовке, в текст ошибок не попадает.

const DEFAULT_BASE_URL = 'https://cloud-api.yandex.net/v1/disk'
const CALL_TIMEOUT_MS = 15_000 // cloud-api: короткий таймаут (Go callTimeout)
const TRANSFER_TIMEOUT_MS = 120_000 // перенос байтов крупнее — отдельный, больший
const DEFAULT_RETRY_DELAY_MS = 500
const DEFAULT_MAX_ATTEMPTS = 3
// MAX_API_BODY_BYTES — потолок чтения тела cloud-api (href-ответы и ошибки малы).
// Stat дополнительно гасит риск через limit=0&fields, иначе листинг папки (_embedded)
// мог бы пробить лимит. Перенос файлов идёт с хост-стораджа без этого потолка.
const MAX_API_BODY_BYTES = 1 << 20

export type YadiskConfig = {
  token: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  retryDelayMs?: number
  maxAttempts?: number
}

export type ResourceMeta = {
  // path в форме disk:/Приложения/<app>/... — для web deep-link в Диск фирмы.
  path: string
  // publicUrl (https://yadi.sk/d/<hash>) заполнен только после publish.
  publicUrl: string
}

export class YadiskApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'YadiskApiError'
  }
}

type HrefResp = { href: string }

export class YadiskClient {
  private readonly token: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly retryDelay: number
  private readonly maxAttempts: number

  constructor(cfg: YadiskConfig) {
    if (!cfg.token) throw new Error('yadisk: пустой OAuth-токен')
    this.token = cfg.token
    this.baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.fetchImpl = cfg.fetchImpl ?? fetch
    this.retryDelay = cfg.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    this.maxAttempts = cfg.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  }

  // verify — лёгкая проверка токена В ПРЕДЕЛАХ scope app_folder: GET /resources на
  // app:/ (limit=0 → без листинга). НЕ дёргаем GET /v1/disk (корень Диска): токен
  // scope app_folder корень не видит (403, см. Go-донор), и валидный install-токен
  // ложно зарезался бы на register. Невалидный/просроченный токен здесь даёт 401.
  async verify(): Promise<void> {
    await this.retry(() => this.apiCall('GET', `/resources?${qs({ path: 'app:/', fields: 'path', limit: '0' })}`))
  }

  // upload — залить байты по пути app:/... (overwrite идемпотентен). Родительские
  // папки должны существовать (см. mkdirAll). Href берём внутри retry — он одноразовый.
  async upload(
    path: string,
    data: Uint8Array,
    opts: { mimeType?: string; overwrite?: boolean } = {},
  ): Promise<void> {
    const overwrite = opts.overwrite ?? true
    await this.retry(async () => {
      const href = await this.apiCall<HrefResp>(
        'GET',
        `/resources/upload?${qs({ path, overwrite: String(overwrite) })}`,
      )
      await this.transferPut(href.href, data, opts.mimeType)
    })
  }

  // download — скачать байты по пути (двухшаг, как upload).
  async download(path: string): Promise<Uint8Array> {
    return this.retry(async () => {
      const href = await this.apiCall<HrefResp>('GET', `/resources/download?${qs({ path })}`)
      return this.transferGet(href.href)
    })
  }

  // mkdirAll — создать каталог и всех предков (у API нет mkdir -p): посегментно.
  async mkdirAll(dir: string): Promise<void> {
    for (const d of ancestorDirs(dir)) {
      await this.mkdir(d)
    }
  }

  // publish — опубликовать ресурс (сделать доступным по публичной ссылке).
  // Идемпотентно: повторная публикация снова 200. Тело (Link-объект) игнорируем —
  // саму ссылку читаем последующим stat.
  async publish(path: string): Promise<void> {
    await this.retry(() => this.apiCall('PUT', `/resources/publish?${qs({ path })}`))
  }

  // stat — мета ресурса (путь + публичная ссылка, если опубликован).
  // fields=public_url,path и limit=0 обязательны: без них GET /resources на ПАПКУ
  // вернёт _embedded со списком файлов и пробьёт MAX_API_BODY_BYTES.
  async stat(path: string): Promise<ResourceMeta> {
    return this.retry(async () => {
      const raw = await this.apiCall<{ path: string; public_url?: string }>(
        'GET',
        `/resources?${qs({ path, fields: 'public_url,path', limit: '0' })}`,
      )
      return { path: raw.path, publicUrl: raw.public_url ?? '' }
    })
  }

  private async mkdir(path: string): Promise<void> {
    await this.retry(async () => {
      try {
        await this.apiCall('PUT', `/resources?${qs({ path })}`)
      } catch (e) {
        // 409 = каталог уже есть — идемпотентно, не ошибка.
        if (e instanceof YadiskApiError && e.status === 409) return
        throw e
      }
    })
  }

  // apiCall — один вызов cloud-api (OAuth-заголовок, разбор тела). out пуст —
  // тело читается только для текста ошибки. Возвращает undefined на пустом теле.
  private async apiCall<T = void>(method: string, pathWithQuery: string): Promise<T> {
    const res = await this.send(
      `${this.baseUrl}${pathWithQuery}`,
      { method, headers: { authorization: `OAuth ${this.token}`, accept: 'application/json' } },
      CALL_TIMEOUT_MS,
    )
    const raw = await readCappedText(res, MAX_API_BODY_BYTES, res.status)
    if (res.status >= 400) throw parseAPIError(res.status, raw)
    if (!raw) return undefined as T
    try {
      return JSON.parse(raw) as T
    } catch {
      throw new YadiskApiError(res.status, 'не удалось разобрать ответ')
    }
  }

  // transferPut — заливка байтов по одноразовому upload-href. Хост-сторадж, href
  // уже подписан → OAuth-заголовок НЕ шлём (токен не должен туда утечь).
  private async transferPut(href: string, data: Uint8Array, mimeType?: string): Promise<void> {
    const res = await this.send(
      href,
      { method: 'PUT', body: data, headers: { 'content-type': mimeType || 'application/octet-stream' } },
      TRANSFER_TIMEOUT_MS,
    )
    if (res.status >= 400) {
      const raw = await readCappedText(res, MAX_API_BODY_BYTES, res.status)
      throw parseAPIError(res.status, raw)
    }
  }

  // transferGet — скачивание по download-href. Тоже без OAuth-заголовка.
  private async transferGet(href: string): Promise<Uint8Array> {
    const res = await this.send(href, { method: 'GET' }, TRANSFER_TIMEOUT_MS)
    if (res.status >= 400) {
      const raw = await readCappedText(res, MAX_API_BODY_BYTES, res.status)
      throw parseAPIError(res.status, raw)
    }
    return new Uint8Array(await res.arrayBuffer())
  }

  // send — fetch с таймаутом (AbortController); сетевой сбой/таймаут → YadiskApiError(0)
  // (транзиент). Таймер всегда снимаем, чтобы не держать event loop.
  private async send(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal })
    } catch (e) {
      throw new YadiskApiError(0, e instanceof Error ? e.message : 'сетевая ошибка')
    } finally {
      clearTimeout(timer)
    }
  }

  // retry — повтор fn при транзиентном сбое (0/429/5xx) с экспоненциальным backoff'ом;
  // прочие 4xx и успех возвращаются сразу.
  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn()
      } catch (e) {
        const status = e instanceof YadiskApiError ? e.status : 0
        if (!isTransient(status) || attempt >= this.maxAttempts) throw e
        await delay(this.retryDelay << (attempt - 1))
      }
    }
  }
}

function qs(params: Record<string, string>): string {
  // URLSearchParams кодирует путь как app%3A%2F... (как Go url.Values.Encode).
  return new URLSearchParams(params).toString()
}

function isTransient(status: number): boolean {
  return status === 0 || status === 429 || status >= 500
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// parseAPIError — извлекает человекочитаемое {message|description} из тела ошибки.
// Токен в тело не попадает (живёт только в заголовке), поэтому текст безопасен.
function parseAPIError(status: number, raw: string): YadiskApiError {
  let message = ''
  try {
    const body = JSON.parse(raw) as { message?: string; description?: string }
    message = body.message || body.description || ''
  } catch {
    // тело не JSON — структурированного сообщения нет, оставляем пустым
  }
  return new YadiskApiError(status, message ? `HTTP ${status}: ${message}` : `HTTP ${status}`)
}

// readCappedText — читает тело cloud-api с потолком в cap байт (защита от
// неожиданно большого ответа). Пустое тело → ''.
async function readCappedText(res: Response, cap: number, status: number): Promise<string> {
  const body = res.body
  if (!body) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > cap) {
      await reader.cancel()
      throw new YadiskApiError(status, 'ответ превысил лимит размера')
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(buf)
}

// ancestorDirs("app:/a/b/c") → ["app:/a","app:/a/b","app:/a/b/c"]. Схему (app:/,
// disk:/) распознаём обобщённо — корень схемы (app:/) существует всегда, не создаём.
export function ancestorDirs(dir: string): string[] {
  const m = /^([a-z]+:\/)(.*)$/i.exec(dir)
  if (!m) return [dir]
  const [, prefix, rest] = m
  const parts = rest.split('/').filter(Boolean)
  const out: string[] = []
  let acc = prefix
  for (const part of parts) {
    acc = acc.endsWith('/') ? acc + part : `${acc}/${part}`
    out.push(acc)
  }
  return out
}
