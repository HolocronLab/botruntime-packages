import { XMLParser } from 'fast-xml-parser'

const API_URL = 'https://tracking.russianpost.ru/rtm34'
const CALL_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 1 << 20
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 500

export type TrackingStatus = 'not_found' | 'in_transit' | 'delivered' | 'returned'

export type TrackingOperation = {
  typeCode: number
  attributeCode: number
  typeName: string
  attributeName: string
  occurredAt: string
}

export type TrackingResult = {
  trackingNumber: string
  status: TrackingStatus
  deliveredAt?: string
  lastOperation?: TrackingOperation
  operations: TrackingOperation[]
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type PochtaClientConfig = {
  login: string
  password: string
  baseUrl?: string
  fetchImpl?: FetchLike
  maxAttempts?: number
  retryDelayMs?: number
}

export class PochtaApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'PochtaApiError'
  }
}

export class PochtaClient {
  private readonly login: string
  private readonly password: string
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly maxAttempts: number
  private readonly retryDelayMs: number

  constructor(config: PochtaClientConfig) {
    if (!config.login.trim()) throw new Error('pochta: login is required')
    if (!config.password) throw new Error('pochta: password is required')
    this.login = config.login.trim()
    this.password = config.password
    this.baseUrl = (config.baseUrl ?? API_URL).replace(/\/$/, '')
    this.fetchImpl = config.fetchImpl ?? fetch
    this.maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  }

  async verify(): Promise<void> {
    // Официальный пример РПО из спецификации даёт дешёвый запрос, который
    // проверяет login/password до успешного завершения install.
    await this.track('RA644000001RU')
  }

  async track(rawTrackingNumber: string): Promise<TrackingResult> {
    const trackingNumber = normalizeTrackingNumber(rawTrackingNumber)
    assertTrackingNumber(trackingNumber)
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.requestOnce(trackingNumber)
      } catch (error) {
        const status = error instanceof PochtaApiError ? error.status : 0
        if (!isTransient(status) || attempt >= this.maxAttempts) throw error
        await delay(this.retryDelayMs << (attempt - 1))
      }
    }
  }

  private async requestOnce(trackingNumber: string): Promise<TrackingResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)
    try {
      let response: Response
      try {
        response = await this.fetchImpl(this.baseUrl, {
          method: 'POST',
          headers: { accept: 'application/soap+xml', 'content-type': 'application/soap+xml;charset=UTF-8' },
          body: soapRequest(trackingNumber, this.login, this.password),
          signal: controller.signal,
        })
      } catch (error) {
        throw new PochtaApiError(0, error instanceof Error ? error.message : 'network error')
      }
      const text = await readCappedText(response)
      if (containsSoapFault(text)) {
        throw new PochtaApiError(response.status, `Pochta API SOAP Fault (HTTP ${response.status})`)
      }
      if (!response.ok) throw new PochtaApiError(response.status, `Pochta API returned HTTP ${response.status}`)
      return parseTrackingResponse(trackingNumber, text)
    } finally {
      clearTimeout(timer)
    }
  }
}

export function normalizeTrackingNumber(value: string): string {
  return value.replace(/[\s-]+/g, '').toUpperCase()
}

export function assertTrackingNumber(value: string): void {
  if (!/^\d{14}$/.test(value) && !/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(value)) {
    throw new PochtaApiError(400, 'Трек-номер Почты России должен содержать 14 цифр или соответствовать формату S10')
  }
}

function soapRequest(trackingNumber: string, login: string, password: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
  xmlns:oper="http://russianpost.org/operationhistory"
  xmlns:data="http://russianpost.org/operationhistory/data"
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header/>
  <soap:Body>
    <oper:getOperationHistory>
      <data:OperationHistoryRequest>
        <data:Barcode>${escapeXml(trackingNumber)}</data:Barcode>
        <data:MessageType>0</data:MessageType>
        <data:Language>RUS</data:Language>
      </data:OperationHistoryRequest>
      <data:AuthorizationHeader soapenv:mustUnderstand="1">
        <data:login>${escapeXml(login)}</data:login>
        <data:password>${escapeXml(password)}</data:password>
      </data:AuthorizationHeader>
    </oper:getOperationHistory>
  </soap:Body>
</soap:Envelope>`
}

function parseTrackingResponse(trackingNumber: string, xml: string): TrackingResult {
  let parsed: any
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
      trimValues: true,
      isArray: (_name, path) => String(path).endsWith('OperationHistoryData.historyRecord'),
    }).parse(xml)
  } catch {
    throw new PochtaApiError(502, 'Pochta API returned invalid XML')
  }
  const data = parsed?.Envelope?.Body?.getOperationHistoryResponse?.OperationHistoryData
  if (data === undefined || data === null || (typeof data !== 'object' && data !== '')) {
    throw new PochtaApiError(502, 'Pochta API returned an invalid history')
  }
  const historyRecord = typeof data === 'object' ? data.historyRecord : undefined
  const records = Array.isArray(historyRecord)
    ? historyRecord
    : historyRecord
      ? [historyRecord]
      : []
  const operations = records.map(parseOperation).sort((left, right) =>
    Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
  )
  const lastOperation = operations.at(-1)
  const terminal = operations.filter((item) => item.typeCode === 2 || item.typeCode === 3).at(-1)
  const status: TrackingStatus = !operations.length
    ? 'not_found'
    : terminal?.typeCode === 2
      ? 'delivered'
      : terminal?.typeCode === 3
        ? 'returned'
        : 'in_transit'
  return {
    trackingNumber,
    status,
    deliveredAt: status === 'delivered' ? terminal?.occurredAt : undefined,
    lastOperation,
    operations,
  }
}

function parseOperation(record: any): TrackingOperation {
  const params = record?.OperationParameters
  const typeCode = Number(params?.OperType?.Id)
  const attributeCode = Number(params?.OperAttr?.Id ?? 0)
  const occurred = typeof params?.OperDate === 'string' ? new Date(params.OperDate) : undefined
  if (!Number.isInteger(typeCode) || typeCode < 0 || !Number.isInteger(attributeCode) || attributeCode < 0 || !occurred || Number.isNaN(occurred.getTime())) {
    throw new PochtaApiError(502, 'Pochta API returned an incomplete operation')
  }
  return {
    typeCode,
    attributeCode,
    typeName: typeof params?.OperType?.Name === 'string' ? params.OperType.Name : '',
    attributeName: typeof params?.OperAttr?.Name === 'string' ? params.OperAttr.Name : '',
    occurredAt: occurred.toISOString(),
  }
}

function containsSoapFault(xml: string): boolean {
  return /<(?:[A-Za-z_][\w.-]*:)?Fault(?:\s|>)/.test(xml)
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]!)
}

function isTransient(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500
}

async function readCappedText(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new PochtaApiError(response.status, 'Pochta API response is too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}
