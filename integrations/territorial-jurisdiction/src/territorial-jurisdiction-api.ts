const DEFAULT_BASE_URL = 'https://api.xn----7sbarabva2auedgdkhac2adbeqt1tna3e.xn--p1ai'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_RETRY_DELAY_MS = 500
const DEFAULT_MAX_ATTEMPTS = 3
const MAX_RESPONSE_BYTES = 1 << 20

const TRANSIENT_API_ERRORS = new Set([
  'Не удалось получить данные геокодера',
  'Внутренняя ошибка сервера',
])

export type Court = {
  code: string
  title: string
  address: string
  site?: string
  email?: string
  tel?: string
}

export type JurisdictionSearchResult = {
  remaining: number
  resolvedAddress: string | null
  resolvedCoordinates: string | null
  districtCourt: Court | null
  magistrateCourt: Court | null
}

export type JurisdictionAccount = {
  name: string
  email: string
  blocked: boolean
  balance: number | null
  tariff: 'free' | 'balance'
  price: number | null
  remainingRequests: number | null
  dailyLimit: number | null
}

export type TerritorialJurisdictionClientConfig = {
  token: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  retryDelayMs?: number
  maxAttempts?: number
}

export class TerritorialJurisdictionApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'TerritorialJurisdictionApiError'
  }
}

export class TerritorialJurisdictionClient {
  private readonly token: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly retryDelayMs: number
  private readonly maxAttempts: number

  constructor(cfg: TerritorialJurisdictionClientConfig) {
    const token = cfg.token.trim()
    if (!token) throw new Error('territorial-jurisdiction: пустой API-токен')
    this.token = token
    this.baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.fetchImpl = cfg.fetchImpl ?? fetch
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.retryDelayMs = cfg.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    this.maxAttempts = cfg.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error('territorial-jurisdiction: maxAttempts должен быть положительным целым числом')
    }
  }

  async findByAddress(address: string): Promise<JurisdictionSearchResult> {
    const normalized = address.trim()
    if (!normalized) {
      throw new TerritorialJurisdictionApiError(0, 'Адрес не должен быть пустым')
    }
    return this.withRetry(() => this.search({ address: normalized }))
  }

  async findByCoordinates(latitude: number, longitude: number): Promise<JurisdictionSearchResult> {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new TerritorialJurisdictionApiError(0, 'Широта должна быть числом от -90 до 90')
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new TerritorialJurisdictionApiError(0, 'Долгота должна быть числом от -180 до 180')
    }
    return this.withRetry(() => this.search({ coords: `${latitude} ${longitude}` }))
  }

  async getAccount(): Promise<JurisdictionAccount> {
    return this.withRetry(async () => {
      const raw = await this.request('/v1/account', {})
      const apiError = parseErrorEnvelope(raw, this.token)
      if (apiError) throw apiError
      return parseAccount(raw)
    })
  }

  private async search(query: { address: string } | { coords: string }): Promise<JurisdictionSearchResult> {
    const raw = await this.request('/v1/', query)
    const apiError = parseErrorEnvelope(raw, this.token)
    if (apiError) throw apiError
    return parseSearchResult(raw)
  }

  private async request(path: string, query: Record<string, string>): Promise<unknown> {
    const url = new URL(path, `${this.baseUrl}/`)
    url.search = new URLSearchParams({ token: this.token, ...query }).toString()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
    } catch {
      throw new TerritorialJurisdictionApiError(0, 'Сетевая ошибка или таймаут API подсудности', true)
    } finally {
      clearTimeout(timer)
    }

    const body = await readCappedText(response, MAX_RESPONSE_BYTES)
    if (!response.ok) {
      const message = redactToken(extractHttpError(body) || `HTTP ${response.status}`, this.token)
      throw new TerritorialJurisdictionApiError(
        response.status,
        message,
        response.status === 429 || response.status >= 500,
      )
    }
    if (!body) {
      throw new TerritorialJurisdictionApiError(response.status, 'API подсудности вернул пустой ответ')
    }
    try {
      return JSON.parse(body) as unknown
    } catch {
      throw new TerritorialJurisdictionApiError(response.status, 'API подсудности вернул некорректный JSON')
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn()
      } catch (error) {
        if (!(error instanceof TerritorialJurisdictionApiError) || !error.retryable || attempt >= this.maxAttempts) {
          throw error
        }
        await delay(this.retryDelayMs * 2 ** (attempt - 1))
      }
    }
  }
}

function parseSearchResult(value: unknown): JurisdictionSearchResult {
  const root = requireRecord(value, 'ответ поиска')
  const data = requireRecord(root.data, 'data')
  if (data.status !== 1) {
    throw new TerritorialJurisdictionApiError(200, 'API подсудности вернул неизвестный статус')
  }
  const request = requireRecord(root.request, 'request')
  return {
    remaining: requireFiniteNumber(data.last, 'data.last'),
    resolvedAddress: nullableString(request.address, 'request.address'),
    resolvedCoordinates: nullableString(request.coords, 'request.coords'),
    districtCourt: parseCourt(request.court_fs, 'request.court_fs'),
    magistrateCourt: parseCourt(request.court_ms, 'request.court_ms'),
  }
}

function parseCourt(value: unknown, field: string): Court | null {
  if (value === null || value === undefined) return null
  const raw = requireRecord(value, field)
  const court: Court = {
    code: requireString(raw.code, `${field}.code`),
    title: requireString(raw.title, `${field}.title`),
    address: requireString(raw.address, `${field}.address`),
  }
  for (const optional of ['site', 'email', 'tel'] as const) {
    const item = raw[optional]
    if (item !== undefined && item !== null && item !== '') {
      court[optional] = requireString(item, `${field}.${optional}`)
    }
  }
  return court
}

function parseAccount(value: unknown): JurisdictionAccount {
  const root = requireRecord(value, 'ответ аккаунта')
  const tariff = requireString(root.tariff, 'tariff')
  if (tariff !== 'free' && tariff !== 'balance') {
    throw new TerritorialJurisdictionApiError(200, 'API подсудности вернул неизвестный тариф')
  }
  return {
    name: requireString(root.name, 'name'),
    email: requireString(root.email, 'email'),
    blocked: requireBooleanFlag(root.blocking, 'blocking'),
    balance: nullableNumber(root.balance, 'balance'),
    tariff,
    price: nullableNumber(root.price, 'price'),
    remainingRequests: nullableNumber(root.count_last, 'count_last'),
    dailyLimit: nullableNumber(root.count_max, 'count_max'),
  }
}

function parseErrorEnvelope(value: unknown, token: string): TerritorialJurisdictionApiError | null {
  if (!isRecord(value) || !isRecord(value.data) || value.data.status !== 0) return null
  const rawMessage = typeof value.data.error === 'string' && value.data.error.trim()
    ? value.data.error.trim()
    : 'API подсудности вернул ошибку без описания'
  const message = redactToken(rawMessage, token)
  return new TerritorialJurisdictionApiError(200, message, TRANSIENT_API_ERRORS.has(rawMessage))
}

function extractHttpError(raw: string): string {
  try {
    const value = JSON.parse(raw) as unknown
    if (isRecord(value)) {
      if (typeof value.error === 'string') return value.error
      if (typeof value.message === 'string') return value.message
      if (isRecord(value.data) && typeof value.data.error === 'string') return value.data.error
    }
  } catch {
    // Не включаем произвольное тело ответа в ошибку: там может оказаться токен.
  }
  return ''
}

async function readCappedText(response: Response, cap: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > cap) {
      await reader.cancel()
      throw new TerritorialJurisdictionApiError(response.status, 'Ответ API подсудности превысил лимит размера')
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

function redactToken(message: string, token: string): string {
  return token ? message.split(token).join('[REDACTED]') : message
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TerritorialJurisdictionApiError(200, `Некорректное поле ${field} в ответе API подсудности`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TerritorialJurisdictionApiError(200, `Некорректное поле ${field} в ответе API подсудности`)
  }
  return value
}

function nullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  return requireString(value, field)
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TerritorialJurisdictionApiError(200, `Некорректное поле ${field} в ответе API подсудности`)
  }
  return value
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null
  return requireFiniteNumber(value, field)
}

function requireBooleanFlag(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value
  if (value === 0) return false
  if (value === 1) return true
  throw new TerritorialJurisdictionApiError(200, `Некорректное поле ${field} в ответе API подсудности`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
