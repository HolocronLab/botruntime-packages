import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import type { CloudConvertConfiguration, NormalizedCloudConvertConfiguration } from './config'
import { normalizeConfiguration } from './config'
import { CLOUD_CONVERT_ERROR_CODE, CloudConvertError } from './errors'

export const CLOUD_CONVERT_LIMITS = {
  sourceBytes: 25 * 1024 * 1024,
  outputBytes: 50 * 1024 * 1024,
  downloadTimeoutMs: 15_000,
  actionTimeoutMs: 60_000,
  cleanupTimeoutMs: 5_000,
  maxRedirects: 3,
  jsonBytes: 1024 * 1024,
} as const

export const CLOUD_CONVERT_ENDPOINTS = {
  api: 'https://api.cloudconvert.com/v2',
  syncApi: 'https://sync.api.cloudconvert.com/v2',
  uploadHost: 'upload.cloudconvert.com',
  storageHost: 'storage.cloudconvert.com',
} as const

export type ConvertToPdfInput = {
  fileUrl: string
  sha256: string
  sourceFormat: 'docx'
}

export type ConvertToPdfOutput = {
  pdfBase64: string
  pageCount: number
  sourceSha256: string
  engine: string
}

export type ConversionAudit = {
  sourceSha256?: string
  inputBytes?: number
  outputBytes?: number
  pageCount?: number
  engine?: string
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type RuntimeFileEnvironment = {
  BP_API_URL?: string
  CLOUDAPI_PUBLIC_BASE_URL?: string
  BP_TOKEN?: string
  BP_BOT_ID?: string
}

type Limits = typeof CLOUD_CONVERT_LIMITS

export type CloudConvertClientOptions = {
  fetchImpl?: FetchLike
  runtimeEnv?: RuntimeFileEnvironment
  limits?: Partial<Limits>
}

export type CloudConvertBinaryResult = {
  bytes: Uint8Array
  engine: string
}

type CloudConvertTask = {
  operation?: unknown
  status?: unknown
  code?: unknown
  engine?: unknown
  engine_version?: unknown
  result?: unknown
}

type CloudConvertJob = {
  id: string
  status: string
  tasks: CloudConvertTask[]
}

type UploadForm = {
  url: string
  parameters: Record<string, string | number | boolean>
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const UNSUPPORTED_TASK_CODES = new Set([
  'INPUT_FORMAT_ERROR',
  'INVALID_DATA',
  'INVALID_FILE',
  'OPEN_FAILED',
  'UNSUPPORTED_CONVERSION_TYPE',
  'UNSUPPORTED_FORMAT',
])

export class CloudConvertClient {
  private readonly configuration: NormalizedCloudConvertConfiguration
  private readonly fetchImpl: FetchLike
  private readonly runtimeEnv: RuntimeFileEnvironment
  private readonly limits: Limits

  constructor(
    configuration: Partial<CloudConvertConfiguration>,
    options: CloudConvertClientOptions = {},
  ) {
    this.configuration = normalizeConfiguration(configuration)
    this.fetchImpl = options.fetchImpl ?? fetch
    this.runtimeEnv = options.runtimeEnv ?? {
      BP_API_URL: process.env.BP_API_URL,
      CLOUDAPI_PUBLIC_BASE_URL: process.env.CLOUDAPI_PUBLIC_BASE_URL,
      BP_TOKEN: process.env.BP_TOKEN,
      BP_BOT_ID: process.env.BP_BOT_ID,
    }
    this.limits = { ...CLOUD_CONVERT_LIMITS, ...options.limits }
  }

  async verify(): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.limits.downloadTimeoutMs)
    try {
      let response: Response
      try {
        response = await this.fetchImpl(`${CLOUD_CONVERT_ENDPOINTS.api}/jobs?per_page=1`, {
          headers: this.apiHeaders(),
          redirect: 'error',
          signal: controller.signal,
        })
      } catch (error) {
        throw this.networkError(error, controller.signal, 'Проверка API CloudConvert')
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined)
        throw providerHttpError(response.status, 'Проверка API CloudConvert')
      }
      await response.body?.cancel().catch(() => undefined)
    } finally {
      clearTimeout(timer)
    }
  }

  async convert(input: ConvertToPdfInput, audit: ConversionAudit = {}): Promise<ConvertToPdfOutput> {
    validateInput(input)
    const deadline = Date.now() + this.limits.actionTimeoutMs
    const source = await this.downloadSource(
      input.fileUrl,
      Math.min(this.limits.downloadTimeoutMs, remainingMs(deadline)),
    )
    audit.inputBytes = source.byteLength

    const actualSha256 = sha256(source)
    audit.sourceSha256 = actualSha256
    if (actualSha256 !== input.sha256.toLowerCase()) {
      throw new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.sourceMismatch,
        `SHA-256 скачанного DOCX не совпадает с ожидаемым (получен ${actualSha256})`,
      )
    }
    assertDocx(source)

    const converted = await this.convertBytes(source, remainingMs(deadline))
    const pageCount = await pageCountOf(converted.bytes)
    audit.outputBytes = converted.bytes.byteLength
    audit.pageCount = pageCount
    audit.engine = converted.engine

    return {
      pdfBase64: Buffer.from(converted.bytes).toString('base64'),
      pageCount,
      sourceSha256: actualSha256,
      engine: converted.engine,
    }
  }

  /** Bypasses runtime download and SHA verification; callers must supply trusted DOCX bytes. */
  async convertDocxBytes(
    bytes: Uint8Array,
    timeoutMs = this.limits.actionTimeoutMs,
  ): Promise<CloudConvertBinaryResult> {
    if (bytes.byteLength > this.limits.sourceBytes) {
      throw new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.sourceTooLarge,
        'Исходный DOCX превышает лимит 25 МБ',
      )
    }
    assertDocx(bytes)
    return this.convertBytes(bytes, timeoutMs)
  }

  private async downloadSource(fileUrl: string, timeoutMs: number): Promise<Uint8Array> {
    const initialUrl = this.resolveInitialFileUrl(fileUrl)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), positiveTimeout(timeoutMs))
    let currentUrl = initialUrl
    try {
      for (let redirectCount = 0; ; ) {
        let response: Response
        try {
          response = await this.fetchImpl(currentUrl, {
            method: 'GET',
            headers: this.fileHeaders(currentUrl),
            redirect: 'manual',
            signal: controller.signal,
          })
        } catch (error) {
          throw new CloudConvertError(
            CLOUD_CONVERT_ERROR_CODE.fetchFailed,
            controller.signal.aborted
              ? 'Скачивание исходного DOCX превысило дедлайн 15 секунд'
              : 'Не удалось скачать исходный DOCX из файлового хранилища',
            error instanceof Error ? { cause: error } : undefined,
          )
        }

        if (REDIRECT_STATUSES.has(response.status)) {
          if (redirectCount >= this.limits.maxRedirects) {
            await response.body?.cancel().catch(() => undefined)
            throw new CloudConvertError(
              CLOUD_CONVERT_ERROR_CODE.fetchFailed,
              'Файловое хранилище вернуло слишком много редиректов',
            )
          }
          const location = response.headers.get('location')
          await response.body?.cancel().catch(() => undefined)
          if (!location) {
            throw new CloudConvertError(
              CLOUD_CONVERT_ERROR_CODE.fetchFailed,
              'Редирект файлового хранилища не содержит Location',
            )
          }
          currentUrl = safeHttpsUrl(location, currentUrl)
          if (this.isRuntimeOrigin(currentUrl) && !isCanonicalFileDownload(currentUrl)) {
            throw new CloudConvertError(
              CLOUD_CONVERT_ERROR_CODE.fetchFailed,
              'Редирект ведёт на недопустимый endpoint Botruntime',
            )
          }
          redirectCount++
          continue
        }

        if (response.status !== 200) {
          await response.body?.cancel().catch(() => undefined)
          throw new CloudConvertError(
            CLOUD_CONVERT_ERROR_CODE.fetchFailed,
            `Файловое хранилище вернуло HTTP ${response.status}`,
          )
        }
        try {
          return await readBytesCapped(
            response,
            this.limits.sourceBytes,
            () => new CloudConvertError(
              CLOUD_CONVERT_ERROR_CODE.sourceTooLarge,
              'Исходный DOCX превышает лимит 25 МБ',
            ),
          )
        } catch (error) {
          if (error instanceof CloudConvertError) throw error
          throw new CloudConvertError(
            CLOUD_CONVERT_ERROR_CODE.fetchFailed,
            controller.signal.aborted
              ? 'Скачивание исходного DOCX превысило дедлайн 15 секунд'
              : 'Соединение с файловым хранилищем оборвалось при скачивании DOCX',
            error instanceof Error ? { cause: error } : undefined,
          )
        }
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private resolveInitialFileUrl(fileUrl: string): string {
    const parsed = safeHttpsUrl(fileUrl)
    if (!this.isRuntimeOrigin(parsed) || !isCanonicalFileDownload(parsed)) {
      throw new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.fetchFailed,
        'fileUrl должен быть защищённым download-URL файлового хранилища Botruntime',
      )
    }
    const internalBase = this.runtimeEnv.BP_API_URL
    if (!internalBase) return parsed
    const internal = safeHttpsUrl(internalBase)
    const source = new URL(parsed)
    return new URL(`${source.pathname}${source.search}`, internal).toString()
  }

  private fileHeaders(url: string): Headers {
    const headers = new Headers({ accept: DOCX_CONTENT_TYPE })
    if (!this.isRuntimeOrigin(url)) return headers
    if (!isCanonicalFileDownload(url)) {
      throw new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.fetchFailed,
        'Учётные данные нельзя отправить на этот endpoint Botruntime',
      )
    }
    const token = this.runtimeEnv.BP_TOKEN
    const botId = this.runtimeEnv.BP_BOT_ID
    if (!token || !botId) {
      throw new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.fetchFailed,
        'В runtime отсутствуют учётные данные файлового хранилища',
      )
    }
    headers.set('authorization', `Bearer ${token}`)
    headers.set('x-bot-id', botId)
    return headers
  }

  private isRuntimeOrigin(url: string): boolean {
    return [this.runtimeEnv.BP_API_URL, this.runtimeEnv.CLOUDAPI_PUBLIC_BASE_URL]
      .filter((value): value is string => Boolean(value))
      .some((base) => sameOrigin(url, base))
  }

  private async convertBytes(source: Uint8Array, timeoutMs: number): Promise<CloudConvertBinaryResult> {
    const deadline = Date.now() + timeoutMs
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), positiveTimeout(timeoutMs))
    let jobId: string | undefined
    let result: CloudConvertBinaryResult | undefined
    let failure: unknown

    try {
      const created = await this.createJob(controller.signal, timeoutMs)
      jobId = created.id
      const uploadTask = findTask(created, 'import/upload')
      await this.uploadSource(uploadFormOf(uploadTask), source, controller.signal)
      const completed = await this.waitForJob(jobId, controller.signal)
      if (completed.status === 'error') throw failedJobError(completed)
      if (completed.status !== 'finished') {
        throw new CloudConvertError(
          CLOUD_CONVERT_ERROR_CODE.conversionFailed,
          'CloudConvert вернул незавершённый job из sync endpoint',
        )
      }

      const convertTask = findTask(completed, 'convert')
      if (convertTask.status !== 'finished') throw failedJobError(completed)
      const engine = engineOf(convertTask)
      const exportTask = findTask(completed, 'export/url')
      const outputUrl = exportUrlOf(exportTask)
      const bytes = await this.downloadOutput(outputUrl, controller.signal)
      result = { bytes, engine }
    } catch (error) {
      failure = error instanceof CloudConvertError
        ? error
        : this.networkError(error, controller.signal, 'Конвертация CloudConvert')
    } finally {
      clearTimeout(timer)
    }

    if (jobId) {
      const cleanupBudget = deadline - Date.now()
      if (cleanupBudget <= 0) {
        if (!failure) {
          failure = new CloudConvertError(
            CLOUD_CONVERT_ERROR_CODE.timeout,
            'Действие превысило дедлайн 60 секунд до очистки job CloudConvert',
          )
        }
      } else {
        try {
          await this.deleteJob(jobId, Math.min(this.limits.cleanupTimeoutMs, cleanupBudget))
        } catch (cleanupError) {
          if (!failure) failure = cleanupError
        }
      }
    }
    if (failure) throw failure
    if (!result) {
      throw new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.conversionFailed,
        'CloudConvert не вернул результат конвертации',
      )
    }
    return result
  }

  private async createJob(signal: AbortSignal, timeoutMs: number): Promise<CloudConvertJob> {
    const taskTimeout = Math.max(1, Math.min(55, Math.floor(timeoutMs / 1000)))
    const payload = {
      tasks: {
        upload_source: { operation: 'import/upload' },
        convert_to_pdf: {
          operation: 'convert',
          input: 'upload_source',
          input_format: 'docx',
          output_format: 'pdf',
          engine: 'office',
          filename: 'converted.pdf',
          timeout: taskTimeout,
        },
        export_pdf: {
          operation: 'export/url',
          input: 'convert_to_pdf',
          inline: false,
          archive_multiple_files: false,
        },
      },
    }
    const json = await this.apiJson(`${CLOUD_CONVERT_ENDPOINTS.api}/jobs`, {
      method: 'POST',
      headers: this.apiHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(payload),
      redirect: 'error',
      signal,
    }, 'Создание job CloudConvert')
    return jobOf(json)
  }

  private async uploadSource(formSpec: UploadForm, source: Uint8Array, signal: AbortSignal): Promise<void> {
    const url = cloudConvertUrl(formSpec.url, CLOUD_CONVERT_ENDPOINTS.uploadHost, 'upload')
    const form = new FormData()
    for (const [name, value] of Object.entries(formSpec.parameters)) {
      if (name === 'file' || !/^[A-Za-z0-9_.-]{1,128}$/.test(name)) {
        throw new CloudConvertError(
          CLOUD_CONVERT_ERROR_CODE.conversionFailed,
          'CloudConvert вернул некорректные параметры upload form',
        )
      }
      form.append(name, String(value))
    }
    form.append(
      'file',
      new Blob([arrayBufferOf(source)], { type: DOCX_CONTENT_TYPE }),
      'source.docx',
    )

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        body: form,
        redirect: 'error',
        signal,
      })
    } catch (error) {
      throw this.networkError(error, signal, 'Загрузка DOCX в CloudConvert')
    }
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel().catch(() => undefined)
      throw providerHttpError(response.status, 'Загрузка DOCX в CloudConvert')
    }
    await response.body?.cancel().catch(() => undefined)
  }

  private async waitForJob(jobId: string, signal: AbortSignal): Promise<CloudConvertJob> {
    const safeId = safeJobId(jobId)
    const json = await this.apiJson(`${CLOUD_CONVERT_ENDPOINTS.syncApi}/jobs/${safeId}`, {
      headers: this.apiHeaders(),
      redirect: 'error',
      signal,
    }, 'Ожидание job CloudConvert')
    return jobOf(json)
  }

  private async downloadOutput(rawUrl: string, signal: AbortSignal): Promise<Uint8Array> {
    const url = cloudConvertUrl(rawUrl, CLOUD_CONVERT_ENDPOINTS.storageHost, 'export')
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: 'application/pdf' },
        redirect: 'error',
        signal,
      })
    } catch (error) {
      throw this.networkError(error, signal, 'Скачивание PDF из CloudConvert')
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined)
      throw providerHttpError(response.status, 'Скачивание PDF из CloudConvert')
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType && contentType !== 'application/pdf' && contentType !== 'application/octet-stream') {
      await response.body?.cancel().catch(() => undefined)
      throw new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.conversionFailed,
        `CloudConvert вернул неожиданный Content-Type ${contentType}`,
      )
    }
    const bytes = await readBytesCapped(
      response,
      this.limits.outputBytes,
      () => new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.conversionFailed,
        'Результирующий PDF превышает лимит 50 МБ',
      ),
    )
    if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
      throw new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.conversionFailed,
        'CloudConvert вернул данные без сигнатуры PDF',
      )
    }
    return bytes
  }

  private async deleteJob(jobId: string, timeoutMs: number): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), positiveTimeout(timeoutMs))
    try {
      let response: Response
      try {
        response = await this.fetchImpl(
          `${CLOUD_CONVERT_ENDPOINTS.api}/jobs/${safeJobId(jobId)}`,
          {
            method: 'DELETE',
            headers: this.apiHeaders(),
            redirect: 'error',
            signal: controller.signal,
          },
        )
      } catch (error) {
        throw this.networkError(error, controller.signal, 'Удаление job CloudConvert')
      }
      if (response.status !== 204 && response.status !== 200 && response.status !== 404) {
        await response.body?.cancel().catch(() => undefined)
        throw providerHttpError(response.status, 'Удаление job CloudConvert')
      }
      await response.body?.cancel().catch(() => undefined)
    } finally {
      clearTimeout(timer)
    }
  }

  private async apiJson(url: string, init: RequestInit, phase: string): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetchImpl(url, init)
    } catch (error) {
      throw this.networkError(error, init.signal, phase)
    }
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel().catch(() => undefined)
      throw providerHttpError(response.status, phase)
    }
    const bytes = await readBytesCapped(
      response,
      this.limits.jsonBytes,
      () => new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.conversionFailed,
        `${phase}: ответ превышает допустимый размер`,
      ),
    )
    try {
      return JSON.parse(new TextDecoder().decode(bytes))
    } catch (error) {
      throw new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.conversionFailed,
        `${phase}: CloudConvert вернул некорректный JSON`,
        error instanceof Error ? { cause: error } : undefined,
      )
    }
  }

  private apiHeaders(extra?: Record<string, string>): Headers {
    return new Headers({
      accept: 'application/json',
      authorization: `Bearer ${this.configuration.apiKey}`,
      ...extra,
    })
  }

  private networkError(error: unknown, signal: AbortSignal | null | undefined, phase: string): CloudConvertError {
    if (signal?.aborted || isAbortError(error)) {
      return new CloudConvertError(
        CLOUD_CONVERT_ERROR_CODE.timeout,
        `${phase} превысило дедлайн`,
        error instanceof Error ? { cause: error } : undefined,
      )
    }
    return new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.conversionFailed,
      `${phase} завершилось сетевой ошибкой`,
      error instanceof Error ? { cause: error } : undefined,
    )
  }
}

export function assertDocx(bytes: Uint8Array): void {
  try {
    const entries = zipCentralDirectoryEntries(bytes)
    if (!entries.has('[Content_Types].xml') || !entries.has('_rels/.rels') || !entries.has('word/document.xml')) {
      throw new Error('required OOXML parts are missing')
    }
    for (const name of entries) {
      const normalized = name.toLowerCase()
      if (normalized.endsWith('/vbaproject.bin') || normalized.endsWith('/vbadata.xml')) {
        throw new Error('macro payload is not allowed')
      }
    }
  } catch (error) {
    throw new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.unsupportedFormat,
      'Содержимое файла не является валидным DOCX без макросов',
      error instanceof Error ? { cause: error } : undefined,
    )
  }
}

async function pageCountOf(bytes: Uint8Array): Promise<number> {
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false })
    const count = document.getPageCount()
    if (count < 1) throw new Error('PDF contains no pages')
    return count
  } catch (error) {
    throw new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.conversionFailed,
      'CloudConvert вернул повреждённый или пустой PDF',
      error instanceof Error ? { cause: error } : undefined,
    )
  }
}

function validateInput(input: ConvertToPdfInput): void {
  if (input.sourceFormat !== 'docx') {
    throw new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.unsupportedFormat,
      `Формат ${String(input.sourceFormat)} не поддерживается`,
    )
  }
  if (!/^[a-fA-F0-9]{64}$/.test(input.sha256)) {
    throw new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.sourceMismatch,
      'Ожидаемый SHA-256 должен содержать 64 hex-символа',
    )
  }
}

function jobOf(value: unknown): CloudConvertJob {
  if (!isRecord(value) || !isRecord(value.data)) throw invalidProviderResponse()
  const { id, status, tasks } = value.data
  if (
    typeof id !== 'string'
    || typeof status !== 'string'
    || !Array.isArray(tasks)
    || !tasks.every(isRecord)
  ) {
    throw invalidProviderResponse()
  }
  return { id: safeJobId(id), status, tasks }
}

function findTask(job: CloudConvertJob, operation: string): CloudConvertTask {
  const tasks = job.tasks.filter((task) => task.operation === operation)
  if (tasks.length !== 1) throw invalidProviderResponse()
  return tasks[0]!
}

function uploadFormOf(task: CloudConvertTask): UploadForm {
  if (!isRecord(task.result) || !isRecord(task.result.form)) throw invalidProviderResponse()
  const { url, parameters } = task.result.form
  if (typeof url !== 'string' || !isRecord(parameters)) throw invalidProviderResponse()
  const normalized: Record<string, string | number | boolean> = {}
  for (const [name, value] of Object.entries(parameters)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw invalidProviderResponse()
    }
    normalized[name] = value
  }
  return { url, parameters: normalized }
}

function engineOf(task: CloudConvertTask): string {
  const engine = safeProviderLabel(task.engine)
  const version = safeProviderLabel(task.engine_version)
  if (!engine || !version) {
    throw new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.conversionFailed,
      'CloudConvert не сообщил движок и его версию',
    )
  }
  return `cloudconvert/${engine}/${version}`
}

function exportUrlOf(task: CloudConvertTask): string {
  if (!isRecord(task.result) || !Array.isArray(task.result.files) || task.result.files.length !== 1) {
    throw invalidProviderResponse()
  }
  const file = task.result.files[0]
  if (!isRecord(file) || typeof file.url !== 'string') throw invalidProviderResponse()
  return file.url
}

function failedJobError(job: CloudConvertJob): CloudConvertError {
  const failed = job.tasks.find((task) => task.status === 'error')
  const code = typeof failed?.code === 'string' ? failed.code.toUpperCase() : ''
  if (code.includes('TIMEOUT')) {
    return new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.timeout,
      'CloudConvert превысил внутренний дедлайн конвертации',
    )
  }
  if (failed?.operation === 'convert' && UNSUPPORTED_TASK_CODES.has(code)) {
    return new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.unsupportedFormat,
      'CloudConvert не смог открыть DOCX как поддерживаемый документ',
    )
  }
  return new CloudConvertError(
    CLOUD_CONVERT_ERROR_CODE.conversionFailed,
    'CloudConvert сообщил об ошибке job',
  )
}

function providerHttpError(status: number, phase: string): CloudConvertError {
  if (status === 408 || status === 503 || status === 504) {
    return new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.timeout,
      `${phase}: CloudConvert не уложился в дедлайн`,
    )
  }
  if (status === 401 || status === 403) {
    return new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.conversionFailed,
      `${phase}: CloudConvert отклонил API key или его scopes`,
    )
  }
  if (status === 429) {
    return new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.conversionFailed,
      `${phase}: превышен rate limit CloudConvert`,
    )
  }
  return new CloudConvertError(
    CLOUD_CONVERT_ERROR_CODE.conversionFailed,
    `${phase}: CloudConvert вернул HTTP ${status}`,
  )
}

function invalidProviderResponse(): CloudConvertError {
  return new CloudConvertError(
    CLOUD_CONVERT_ERROR_CODE.conversionFailed,
    'CloudConvert вернул ответ, не соответствующий API v2',
  )
}

function cloudConvertUrl(raw: string, hostname: string, purpose: string): string {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw invalidProviderResponse()
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== hostname
    || (parsed.port && parsed.port !== '443')
    || parsed.username
    || parsed.password
    || !parsed.pathname.startsWith('/')
  ) {
    throw new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.conversionFailed,
      `CloudConvert вернул недопустимый ${purpose} URL`,
    )
  }
  return parsed.toString()
}

function safeJobId(value: string): string {
  if (!/^[A-Za-z0-9-]{1,128}$/.test(value)) throw invalidProviderResponse()
  return value
}

function safeProviderLabel(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(value)) return undefined
  return value
}

function zipCentralDirectoryEntries(bytes: Uint8Array): Set<string> {
  if (bytes.byteLength < 22) throw new Error('ZIP is too short')
  const data = Uint8Array.from(bytes)
  const view = new DataView(data.buffer)
  const eocdStart = Math.max(0, data.byteLength - 65_557)
  let eocd = -1
  for (let offset = data.byteLength - 22; offset >= eocdStart; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error('ZIP central directory is missing')

  const diskNumber = view.getUint16(eocd + 4, true)
  const centralDisk = view.getUint16(eocd + 6, true)
  const diskEntries = view.getUint16(eocd + 8, true)
  const totalEntries = view.getUint16(eocd + 10, true)
  const centralSize = view.getUint32(eocd + 12, true)
  const centralOffset = view.getUint32(eocd + 16, true)
  const commentLength = view.getUint16(eocd + 20, true)
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    throw new Error('multi-disk ZIP is unsupported')
  }
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 is unsupported')
  }
  if (eocd + 22 + commentLength > data.byteLength || centralOffset + centralSize > eocd) {
    throw new Error('ZIP directory bounds are invalid')
  }

  const names = new Set<string>()
  let offset = centralOffset
  for (let index = 0; index < totalEntries; index++) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('invalid central entry')
    }
    const flags = view.getUint16(offset + 8, true)
    if ((flags & 1) !== 0) throw new Error('encrypted ZIP is unsupported')
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const entryCommentLength = view.getUint16(offset + 32, true)
    const end = offset + 46 + nameLength + extraLength + entryCommentLength
    if (end > eocd) throw new Error('central entry bounds are invalid')
    const name = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength))
    if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) {
      throw new Error('unsafe ZIP entry name')
    }
    names.add(name)
    offset = end
  }
  if (offset !== centralOffset + centralSize) throw new Error('central directory size mismatch')
  return names
}

async function readBytesCapped(
  response: Response,
  cap: number,
  tooLarge: () => Error,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > cap) {
    await response.body?.cancel().catch(() => undefined)
    throw tooLarge()
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > cap) throw tooLarge()
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function isCanonicalFileDownload(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.pathname === '/v1/files/download' && Boolean(parsed.searchParams.get('key')?.trim())
  } catch {
    return false
  }
}

function safeHttpsUrl(raw: string, base?: string): string {
  let parsed: URL
  try {
    parsed = base ? new URL(raw, base) : new URL(raw)
  } catch {
    throw new CloudConvertError(CLOUD_CONVERT_ERROR_CODE.fetchFailed, 'URL исходного файла некорректен')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.fetchFailed,
      'Скачивание исходника разрешено только по HTTPS без credentials в URL',
    )
  }
  return parsed.toString()
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

function remainingMs(deadline: number): number {
  const value = deadline - Date.now()
  if (value <= 0) {
    throw new CloudConvertError(CLOUD_CONVERT_ERROR_CODE.timeout, 'Действие превысило дедлайн 60 секунд')
  }
  return value
}

function positiveTimeout(value: number): number {
  return Math.max(1, Math.floor(value))
}

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function arrayBufferOf(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
  return Uint8Array.from(bytes).buffer
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
