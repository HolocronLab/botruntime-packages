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
//  - До handoff можно повторить GET href. Потоковый PUT выполняется один раз;
//    сбой после его начала остаётся outcome_unknown и сверяется через stat.
//  - mkdir идемпотентен: 409 (каталог уже есть) = успех.
//  - Control-call ретраи только на транзиентных (0/429/5xx); прочие 4xx —
//    сразу наружу. Provider PUT не ретраится.
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
  // Stable identity used by durable upload reconciliation.
  size?: number
  sha256?: string
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

  // prepareUpload may retry because no provider effect has started yet. The
  // returned href is used exactly once by uploadStreamOnce.
  async prepareUpload(path: string, overwrite = true, signal?: AbortSignal): Promise<string> {
    const response = await this.retry(
      () => this.apiCall<HrefResp>(
        'GET',
        `/resources/upload?${qs({ path, overwrite: String(overwrite) })}`,
        signal,
      ),
      signal,
    )
    if (!response.href) throw new YadiskApiError(502, 'Яндекс.Диск не вернул upload href')
    return response.href
  }

  // uploadStreamOnce is the provider handoff boundary. It deliberately has no
  // retry and no fixed transfer timeout: the durable operation deadline owns
  // cancellation, so multi-minute uploads are supported without replaying an
  // ambiguous PUT.
  async uploadStreamOnce(
    href: string,
    stream: ReadableStream<Uint8Array>,
    opts: { size: number; mimeType?: string; signal?: AbortSignal },
  ): Promise<void> {
    const init: RequestInit & { duplex: 'half' } = {
      method: 'PUT',
      body: stream,
      duplex: 'half',
      headers: {
        'content-type': opts.mimeType || 'application/octet-stream',
        'content-length': String(opts.size),
      },
    }
    const res = await this.send(href, init, 0, opts.signal)
    if (res.status >= 400) {
      const raw = await readCappedText(res, MAX_API_BODY_BYTES, res.status)
      throw parseAPIError(res.status, raw)
    }
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

  // stat — мета ресурса и stable identity для durable reconciliation.
  // fields + limit=0 обязательны: без них GET /resources на ПАПКУ вернёт
  // _embedded со списком файлов и пробьёт MAX_API_BODY_BYTES.
  async stat(path: string, signal?: AbortSignal): Promise<ResourceMeta> {
    return this.retry(async () => {
      const raw = await this.apiCall<{ path: string; public_url?: string; size?: number; sha256?: string }>(
        'GET',
        `/resources?${qs({ path, fields: 'public_url,path,size,sha256', limit: '0' })}`,
        signal,
      )
      return {
        path: raw.path,
        publicUrl: raw.public_url ?? '',
        size: raw.size,
        sha256: raw.sha256,
      }
    }, signal)
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
  private async apiCall<T = void>(
    method: string,
    pathWithQuery: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.send(
      `${this.baseUrl}${pathWithQuery}`,
      { method, headers: { authorization: `OAuth ${this.token}`, accept: 'application/json' } },
      CALL_TIMEOUT_MS,
      signal,
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
  private async send(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController()
    const onAbort = () => controller.abort(signal?.reason)
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal })
    } catch (e) {
      throw new YadiskApiError(0, e instanceof Error ? e.message : 'сетевая ошибка')
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  // retry — повтор fn при транзиентном сбое (0/429/5xx) с экспоненциальным backoff'ом;
  // прочие 4xx и успех возвращаются сразу.
  private async retry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn()
      } catch (e) {
        const status = e instanceof YadiskApiError ? e.status : 0
        if (!isTransient(status) || attempt >= this.maxAttempts) throw e
        await delay(this.retryDelay << (attempt - 1), signal)
      }
    }
  }
}

function qs(params: Record<string, string>): string {
  // URLSearchParams кодирует путь как app%3A%2F... (как Go url.Values.Encode).
  return new URLSearchParams(params).toString()
}

export function isTransientStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500
}

function isTransient(status: number): boolean {
  return isTransientStatus(status)
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new YadiskApiError(0, 'операция отменена'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new YadiskApiError(0, 'операция отменена'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
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
