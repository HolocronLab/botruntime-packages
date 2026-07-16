const API_URL = 'https://api.yookassa.ru/v3'
const CALL_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 1 << 20
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 500

export type Money = { value: string; currency: 'RUB' }
export type PaymentStatus = 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'

export type Payment = {
  id: string
  caseId: string
  status: PaymentStatus
  paid: boolean
  amount: Money
  confirmationUrl?: string
  capturedAt?: string
}

export type ReceiptCustomer = { email?: string; phone?: string }
export type ReceiptItem = {
  description: string
  quantity: number
  amount: Money
  vatCode: number
  paymentMode?:
    | 'full_prepayment'
    | 'partial_prepayment'
    | 'advance'
    | 'full_payment'
    | 'partial_payment'
    | 'credit'
    | 'credit_payment'
  paymentSubject?: string
}
export type Receipt = {
  customer: ReceiptCustomer
  items: ReceiptItem[]
  taxSystemCode?: number
}

export type CreatePaymentInput = {
  caseId: string
  amount: Money
  description: string
  returnUrl: string
  idempotenceKey: string
  receipt?: Receipt
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type YookassaClientConfig = {
  shopId: string
  secretKey: string
  baseUrl?: string
  fetchImpl?: FetchLike
  maxAttempts?: number
  retryDelayMs?: number
}

export class YookassaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly parameter?: string,
  ) {
    super(message)
    this.name = 'YookassaApiError'
  }
}

export class YookassaClient {
  private readonly baseUrl: string
  private readonly auth: string
  private readonly fetchImpl: FetchLike
  private readonly maxAttempts: number
  private readonly retryDelayMs: number

  constructor(config: YookassaClientConfig) {
    if (!config.shopId) throw new Error('yookassa: shopId is required')
    if (!config.secretKey) throw new Error('yookassa: secretKey is required')
    this.baseUrl = (config.baseUrl ?? API_URL).replace(/\/$/, '')
    this.auth = `Basic ${btoa(`${config.shopId}:${config.secretKey}`)}`
    this.fetchImpl = config.fetchImpl ?? fetch
    this.maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    const raw = await this.request('POST', '/payments', {
      idempotenceKey: input.idempotenceKey,
      body: {
        amount: input.amount,
        capture: true,
        confirmation: { type: 'redirect', return_url: input.returnUrl },
        description: input.description,
        metadata: { caseId: input.caseId },
        receipt: input.receipt ? receiptRequest(input.receipt) : undefined,
      },
    })
    return parsePayment(raw)
  }

  async getPayment(paymentId: string): Promise<Payment> {
    const raw = await this.request('GET', `/payments/${encodeURIComponent(paymentId)}`)
    return parsePayment(raw)
  }

  async verifyCredentials(): Promise<void> {
    try {
      await this.request('GET', '/payments/00000000-0000-0000-0000-000000000000', { maxAttempts: 1 })
    } catch (error) {
      if (error instanceof YookassaApiError && (error.status === 400 || error.status === 404)) return
      throw error
    }
  }

  private async request(
    method: string,
    path: string,
    options: { body?: unknown; idempotenceKey?: string; maxAttempts?: number } = {},
  ): Promise<unknown> {
    const attempts = options.maxAttempts ?? this.maxAttempts
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.requestOnce(method, path, options)
      } catch (error) {
        const status = error instanceof YookassaApiError ? error.status : 0
        if (!isTransient(status) || attempt >= attempts) throw error
        await delay(this.retryDelayMs << (attempt - 1))
      }
    }
  }

  private async requestOnce(
    method: string,
    path: string,
    options: { body?: unknown; idempotenceKey?: string },
  ): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)
    try {
      const headers = new Headers({ authorization: this.auth, accept: 'application/json' })
      if (options.body !== undefined) headers.set('content-type', 'application/json')
      if (options.idempotenceKey) headers.set('idempotence-key', options.idempotenceKey)
      let response: Response
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        })
      } catch (error) {
        throw new YookassaApiError(0, error instanceof Error ? error.message : 'network error')
      }
      const text = await readCappedText(response)
      if (!response.ok) {
        const diagnostics = parseProviderError(text)
        throw new YookassaApiError(
          response.status,
          formatProviderError(response.status, diagnostics),
          diagnostics.code,
          diagnostics.parameter,
        )
      }
      if (!text) return undefined
      try {
        return JSON.parse(text)
      } catch {
        throw new YookassaApiError(response.status, 'YooKassa API returned invalid JSON')
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

function parsePayment(raw: unknown): Payment {
  if (!isRecord(raw)) throw new YookassaApiError(502, 'YooKassa API returned an invalid payment')
  const amount = raw.amount
  const metadata = raw.metadata
  const confirmation = raw.confirmation
  const id = typeof raw.id === 'string' ? raw.id : ''
  const status = isPaymentStatus(raw.status) ? raw.status : undefined
  const paid = typeof raw.paid === 'boolean' ? raw.paid : undefined
  const value = isRecord(amount) && typeof amount.value === 'string' ? amount.value : ''
  const currency = isRecord(amount) && amount.currency === 'RUB' ? 'RUB' : undefined
  const caseId = isRecord(metadata) && typeof metadata.caseId === 'string' ? metadata.caseId : ''
  if (!id || !status || paid === undefined || !value || !currency || !caseId) {
    throw new YookassaApiError(502, 'YooKassa API returned an incomplete payment')
  }
  return {
    id,
    status,
    paid,
    amount: { value, currency },
    caseId,
    confirmationUrl:
      isRecord(confirmation) && typeof confirmation.confirmation_url === 'string'
        ? confirmation.confirmation_url
        : undefined,
    capturedAt: typeof raw.captured_at === 'string' ? raw.captured_at : undefined,
  }
}

function receiptRequest(receipt: Receipt): Record<string, unknown> {
  return {
    customer: receipt.customer,
    items: receipt.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      amount: item.amount,
      vat_code: item.vatCode,
      payment_mode: item.paymentMode,
      payment_subject: item.paymentSubject,
    })),
    tax_system_code: receipt.taxSystemCode,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === 'pending' || value === 'waiting_for_capture' || value === 'succeeded' || value === 'canceled'
}

type ProviderErrorDiagnostics = { code?: string; parameter?: string }

function parseProviderError(text: string): ProviderErrorDiagnostics {
  try {
    const raw: unknown = JSON.parse(text)
    if (!isRecord(raw)) return {}
    return {
      code: safeDiagnostic(raw.code),
      parameter: safeDiagnostic(raw.parameter),
    }
  } catch {
    return {}
  }
}

function safeDiagnostic(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 128 || !/^[a-zA-Z0-9_.\[\]-]+$/.test(value)) return undefined
  return value
}

function formatProviderError(status: number, diagnostics: ProviderErrorDiagnostics): string {
  const suffix = [
    diagnostics.code ? `code=${diagnostics.code}` : undefined,
    diagnostics.parameter ? `parameter=${diagnostics.parameter}` : undefined,
  ].filter(Boolean)
  return `YooKassa API returned HTTP ${status}${suffix.length ? ` (${suffix.join(', ')})` : ''}`
}

function isTransient(status: number): boolean {
  return status === 0 || status === 429 || status >= 500
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
      throw new YookassaApiError(response.status, 'YooKassa API response is too large')
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
