import { isApiError, type IntegrationLogger } from '@holocronlab/botruntime-sdk'
import type { YadiskConfiguration } from './config'
import { clientFromConfig } from './config'
import { resolveAppPath } from './paths'
import { YadiskApiError, type ResourceMeta, type YadiskClient } from './yadisk-api'

const MAX_FILE_BYTES = 1 << 30
const SHA256_HEX = /^[0-9a-f]{64}$/i
const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength

export type ExactFileRef = {
  id: string
  size: number
  contentType?: string
  filename?: string
  checksum: string
}

export type UploadDocumentInput = {
  path: string
  fileRef: ExactFileRef
  mimeType?: string
  overwrite?: boolean
}

export type DurableOperationRequest = {
  operationId: string
  attempt: number
  action: string
  idempotencyKey: string
  input: UploadDocumentInput
  deadline: string
  cancelRequestedAt: string | null
}

export type DurableOperationPhase = 'execute' | 'reconcile' | 'cancel'

export type DurableOperationOutcome =
  | { kind: 'succeeded'; result: { diskPath: string; size: number; checksum: string } }
  | { kind: 'failed'; errorCode: string; errorMessage: string }
  | { kind: 'cancelled' }
  | { kind: 'retry_safe' }
  | { kind: 'still_unknown'; errorCode: string; errorMessage: string }
  | { kind: 'outcome_unknown'; errorCode: string; errorMessage: string }

export type FileStreamClient = {
  downloadFileRef(input: {
    fileRef: ExactFileRef
    signal?: AbortSignal
  }): Promise<{ stream: ReadableStream<Uint8Array> }>
}

type DurableProvider = Pick<YadiskClient, 'prepareUpload' | 'uploadStreamOnce' | 'stat'>

export type DurableOperationDependencies = {
  files: FileStreamClient
  provider?: DurableProvider
}

const failed = (errorCode: string, errorMessage: string): DurableOperationOutcome => ({
  kind: 'failed',
  errorCode,
  errorMessage,
})

const unknown = (kind: 'still_unknown' | 'outcome_unknown'): DurableOperationOutcome => ({
  kind,
  errorCode: 'provider_outcome_unknown',
  errorMessage: 'Яндекс.Диск ещё не подтвердил результат загрузки',
})

const succeeded = (diskPath: string, fileRef: ExactFileRef): DurableOperationOutcome => ({
  kind: 'succeeded',
  result: {
    diskPath,
    size: fileRef.size,
    checksum: fileRef.checksum,
  },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnly = (value: Record<string, unknown>, names: string[]): boolean => {
  const allowed = new Set(names)
  return Object.keys(value).every((name) => allowed.has(name))
}

const parseRequest = (body: string | undefined): DurableOperationRequest => {
  if (!body) throw new Error('missing operation body')
  const raw: unknown = JSON.parse(body)
  if (
    !isRecord(raw)
    || !hasOnly(raw, [
      'operationId',
      'attempt',
      'action',
      'idempotencyKey',
      'input',
      'deadline',
      'cancelRequestedAt',
    ])
    || typeof raw.operationId !== 'string'
    || raw.operationId.length === 0
    || !Number.isInteger(raw.attempt)
    || Number(raw.attempt) < 1
    || raw.action !== 'uploadDocument'
    || typeof raw.idempotencyKey !== 'string'
    || raw.idempotencyKey.length === 0
    || typeof raw.deadline !== 'string'
    || !Number.isFinite(Date.parse(raw.deadline))
    || (raw.cancelRequestedAt !== null && typeof raw.cancelRequestedAt !== 'string')
  ) {
    throw new Error('invalid operation envelope')
  }

  const input = raw.input
  if (
    !isRecord(input)
    || !hasOnly(input, ['path', 'fileRef', 'mimeType', 'overwrite'])
    || typeof input.path !== 'string'
    || input.path.length === 0
    || (input.mimeType !== undefined && typeof input.mimeType !== 'string')
    || (input.overwrite !== undefined && typeof input.overwrite !== 'boolean')
    || !isRecord(input.fileRef)
  ) {
    throw new Error('invalid uploadDocument input')
  }
  const fileRef = input.fileRef
  if (
    !hasOnly(fileRef, ['id', 'size', 'contentType', 'filename', 'checksum'])
    || typeof fileRef.id !== 'string'
    || fileRef.id.length === 0
    || utf8Bytes(fileRef.id) > 1024
    || !Number.isSafeInteger(fileRef.size)
    || Number(fileRef.size) < 0
    || Number(fileRef.size) > MAX_FILE_BYTES
    || (
      fileRef.contentType !== undefined
      && (typeof fileRef.contentType !== 'string' || utf8Bytes(fileRef.contentType) > 255)
    )
    || (
      fileRef.filename !== undefined
      && (typeof fileRef.filename !== 'string' || utf8Bytes(fileRef.filename) > 1024)
    )
    || typeof fileRef.checksum !== 'string'
    || !SHA256_HEX.test(fileRef.checksum)
  ) {
    throw new Error('invalid immutable fileRef')
  }

  return {
    operationId: raw.operationId,
    attempt: Number(raw.attempt),
    action: raw.action,
    idempotencyKey: raw.idempotencyKey,
    deadline: raw.deadline,
    cancelRequestedAt: raw.cancelRequestedAt as string | null,
    input: {
      path: input.path,
      fileRef: {
        id: fileRef.id,
        size: Number(fileRef.size),
        ...(typeof fileRef.contentType === 'string' ? { contentType: fileRef.contentType } : {}),
        ...(typeof fileRef.filename === 'string' ? { filename: fileRef.filename } : {}),
        checksum: fileRef.checksum.toLowerCase(),
      },
      ...(typeof input.mimeType === 'string' ? { mimeType: input.mimeType } : {}),
      ...(typeof input.overwrite === 'boolean' ? { overwrite: input.overwrite } : {}),
    },
  }
}

const deadlineController = (deadline: string): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController()
  const remaining = Math.max(0, Date.parse(deadline) - Date.now())
  const timer = setTimeout(() => controller.abort(new Error('operation deadline reached')), remaining)
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer),
  }
}

const exactProviderFile = (meta: ResourceMeta, fileRef: ExactFileRef): boolean =>
  meta.size === fileRef.size
  && typeof meta.sha256 === 'string'
  && meta.sha256.toLowerCase() === fileRef.checksum.toLowerCase()

const verify = async (
  provider: DurableProvider,
  diskPath: string,
  fileRef: ExactFileRef,
  signal: AbortSignal,
): Promise<boolean> => {
  try {
    return exactProviderFile(await provider.stat(diskPath, signal), fileRef)
  } catch {
    return false
  }
}

const deterministicPreHandoffFailure = (error: unknown): boolean => {
  if (error instanceof YadiskApiError) {
    return error.status >= 400 && error.status < 500 && error.status !== 429
  }
  if (
    typeof error === 'object'
    && error !== null
    && 'status' in error
    && typeof error.status === 'number'
  ) {
    return error.status >= 400 && error.status < 500 && error.status !== 429
  }
  return isApiError(error) && error.code >= 400 && error.code < 500 && error.code !== 429
}

const execute = async (
  request: DurableOperationRequest,
  diskPath: string,
  provider: DurableProvider,
  files: FileStreamClient,
  signal: AbortSignal,
  logger: IntegrationLogger,
): Promise<DurableOperationOutcome> => {
  if (request.cancelRequestedAt !== null) return { kind: 'cancelled' }

  if (await verify(provider, diskPath, request.input.fileRef, signal)) {
    return succeeded(diskPath, request.input.fileRef)
  }

  let href: string
  let stream: ReadableStream<Uint8Array>
  try {
    href = await provider.prepareUpload(
      diskPath,
      request.input.overwrite ?? true,
      signal,
    )
    stream = (await files.downloadFileRef({
      fileRef: request.input.fileRef,
      signal,
    })).stream
  } catch (error) {
    return deterministicPreHandoffFailure(error)
      ? failed('upload_rejected', 'Загрузка отклонена до передачи файла провайдеру')
      : { kind: 'retry_safe' }
  }

  try {
    await provider.uploadStreamOnce(href, stream, {
      size: request.input.fileRef.size,
      mimeType: request.input.mimeType ?? request.input.fileRef.contentType,
      signal,
    })
  } catch {
    // PUT was invoked. A timeout, disconnect, or provider error after this
    // boundary cannot prove that the overwrite did not complete.
    if (await verify(provider, diskPath, request.input.fileRef, signal)) {
      logger.forBot().info('Яндекс.Диск: загрузка подтверждена после сверки')
      return succeeded(diskPath, request.input.fileRef)
    }
    return unknown('outcome_unknown')
  }

  if (await verify(provider, diskPath, request.input.fileRef, signal)) {
    logger.forBot().info('Яндекс.Диск: документ загружен и проверен')
    return succeeded(diskPath, request.input.fileRef)
  }
  return unknown('outcome_unknown')
}

export async function handleDurableOperation(
  phase: string | undefined,
  body: string | undefined,
  configuration: YadiskConfiguration,
  dependencies: DurableOperationDependencies,
  logger: IntegrationLogger,
): Promise<DurableOperationOutcome> {
  let request: DurableOperationRequest
  let diskPath: string
  try {
    request = parseRequest(body)
    diskPath = resolveAppPath(configuration.yadiskFolder ?? '', request.input.path)
  } catch {
    return failed('invalid_operation', 'Некорректный контракт длительной загрузки')
  }

  if (phase !== 'execute' && phase !== 'reconcile' && phase !== 'cancel') {
    return failed('invalid_phase', 'Неизвестная фаза длительной загрузки')
  }

  let provider: DurableProvider
  try {
    provider = dependencies.provider ?? clientFromConfig(configuration)
  } catch {
    return failed('invalid_configuration', 'Конфигурация Яндекс.Диска недоступна')
  }

  const deadline = deadlineController(request.deadline)
  try {
    if (phase === 'execute') {
      return await execute(request, diskPath, provider, dependencies.files, deadline.signal, logger)
    }
    if (await verify(provider, diskPath, request.input.fileRef, deadline.signal)) {
      return succeeded(diskPath, request.input.fileRef)
    }
    return unknown('still_unknown')
  } finally {
    deadline.dispose()
  }
}
