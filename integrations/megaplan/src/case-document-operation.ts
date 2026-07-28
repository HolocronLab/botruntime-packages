import type {
  IntegrationLogger,
  OperationCheckpointClient,
  OperationCheckpointSnapshot,
  OperationFilesClient,
  PreparedFileRefV1,
} from '@holocronlab/botruntime-sdk'
import type { MegaplanApiClient } from './megaplan-api'

const MAX_ATTACHMENTS = 16
const MAX_FILE_BYTES = 1 << 30
const MAX_COMMENT_BYTES = 64 * 1024
const SHA256_HEX = /^sha256:[0-9a-f]{64}$/i
const DISPLAY_NAME = /^[^\r\n]*[^ \t\r\n][^\r\n]*$/
const MIME_TYPE = /^[!-~]+( +[!-~]+)*$/
const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength

export type ExactFileRef = PreparedFileRefV1

export type CaseDocumentAttachment = {
  fileRef: ExactFileRef
  displayName?: string
  mimeType?: string
}

export type PublishCaseDocumentInput = {
  owner: 'deal' | 'contractor' | 'task'
  ownerId: string
  contentHtml: string
  attachments: CaseDocumentAttachment[]
}

export type PublishCaseDocumentRequest = {
  operationId: string
  attempt: number
  action: 'publishCaseDocument'
  idempotencyKey: string
  input: PublishCaseDocumentInput
  deadline: string
  cancelRequestedAt: string | null
  checkpoint: OperationCheckpointClient
}

export type DurableOperationOutcome =
  | { kind: 'succeeded'; result: { commentId: string; attachmentIds: string[] } }
  | { kind: 'failed'; errorCode: string; errorMessage: string }
  | { kind: 'cancelled' }
  | { kind: 'retry_safe' }
  | { kind: 'still_unknown'; errorCode: string; errorMessage: string }
  | { kind: 'outcome_unknown'; errorCode: string; errorMessage: string }

type PublicationProvider = Pick<
  MegaplanApiClient,
  'uploadFileStreamOnce' | 'addComment' | 'findCommentByMarker'
>

export type CaseDocumentOperationDependencies = {
  files: OperationFilesClient
  provider: PublicationProvider
}

const failed = (errorCode: string, errorMessage: string): DurableOperationOutcome => ({
  kind: 'failed',
  errorCode,
  errorMessage,
})

const unknown = (kind: 'still_unknown' | 'outcome_unknown', code: string): DurableOperationOutcome => ({
  kind,
  errorCode: code,
  errorMessage: 'Megaplan не подтвердил итог публикации',
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnly = (value: Record<string, unknown>, names: string[]): boolean => {
  const allowed = new Set(names)
  return Object.keys(value).every((name) => allowed.has(name))
}

const validOptionalText = (value: unknown, maxLength: number): value is string | undefined =>
  value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= maxLength)

const validOptionalUtf8Text = (value: unknown, maxBytes: number): value is string | undefined =>
  value === undefined || (typeof value === 'string' && value.length > 0 && utf8Bytes(value) <= maxBytes)

const validProviderId = (value: unknown): value is string =>
  typeof value === 'string'
  && utf8Bytes(value) >= 1
  && utf8Bytes(value) <= 512
  && !/[\u0000-\u001f\u007f]/.test(value)

const validateFileRef = (value: unknown): value is ExactFileRef => {
  if (
    !isRecord(value)
    || !hasOnly(value, ['version', 'id', 'generation', 'size', 'contentType', 'filename', 'checksum'])
  ) return false
  return (
    value.version === '1'
    && typeof value.id === 'string'
    && value.id.length > 0
    && value.id.length <= 1024
    && typeof value.generation === 'string'
    && value.generation.length > 0
    && value.generation.length <= 1024
    && Number.isSafeInteger(value.size)
    && Number(value.size) >= 1
    && Number(value.size) <= MAX_FILE_BYTES
    && validOptionalUtf8Text(value.contentType, 255)
    && validOptionalUtf8Text(value.filename, 1024)
    && typeof value.checksum === 'string'
    && SHA256_HEX.test(value.checksum)
  )
}

export const validatePublishCaseDocumentInput = (value: unknown): value is PublishCaseDocumentInput => {
  if (
    !isRecord(value)
    || !hasOnly(value, ['owner', 'ownerId', 'contentHtml', 'attachments'])
    || typeof value.owner !== 'string'
    || !['deal', 'contractor', 'task'].includes(value.owner)
    || typeof value.ownerId !== 'string'
    || value.ownerId.length === 0
    || value.ownerId.length > 256
    || typeof value.contentHtml !== 'string'
    || value.contentHtml.length === 0
    || value.contentHtml.length > MAX_COMMENT_BYTES
    || !Array.isArray(value.attachments)
    || value.attachments.length < 1
    || value.attachments.length > MAX_ATTACHMENTS
  ) {
    return false
  }
  return value.attachments.every((attachment) => {
    if (
      !isRecord(attachment)
      || !hasOnly(attachment, ['fileRef', 'displayName', 'mimeType'])
      || !validateFileRef(attachment.fileRef)
      || !validOptionalText(attachment.displayName, 1024)
      || !validOptionalText(attachment.mimeType, 255)
    ) {
      return false
    }
    const name = attachment.displayName ?? attachment.fileRef.filename
    const mimeType = attachment.mimeType ?? attachment.fileRef.contentType ?? 'application/octet-stream'
    return (
      typeof name === 'string'
      && DISPLAY_NAME.test(name)
      && MIME_TYPE.test(mimeType)
    )
  })
}

const checkpointKey = (index: number): string => `attachment:${String(index).padStart(2, '0')}`

const validateCheckpoint = (
  snapshot: OperationCheckpointSnapshot,
  attachmentCount: number,
): boolean => {
  if (
    snapshot.version !== '1'
    || !Number.isSafeInteger(snapshot.revision)
    || snapshot.revision < 0
    || !isRecord(snapshot.entries)
  ) {
    return false
  }
  const allowed = new Set(['comment'])
  for (let index = 0; index < attachmentCount; index++) allowed.add(checkpointKey(index))
  if (!Object.keys(snapshot.entries).every((key) => allowed.has(key))) return false
  if (!Object.values(snapshot.entries).every(validProviderId)) return false
  let seenGap = false
  for (let index = 0; index < attachmentCount; index++) {
    const present = Boolean(snapshot.entries[checkpointKey(index)])
    if (!present) seenGap = true
    else if (seenGap) return false
  }
  if (snapshot.entries.comment) {
    return Array.from({ length: attachmentCount }, (_, index) => snapshot.entries[checkpointKey(index)])
      .every(Boolean)
  }
  return true
}

const operationController = (
  deadline: string,
  hostSignal?: AbortSignal,
): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController()
  const remaining = Math.max(0, Date.parse(deadline) - Date.now())
  const abortForDeadline = () => controller.abort(new Error('operation deadline reached'))
  const timer = remaining === 0 ? undefined : setTimeout(abortForDeadline, remaining)
  if (remaining === 0) abortForDeadline()
  const onHostAbort = () => controller.abort(hostSignal?.reason)
  if (hostSignal?.aborted) onHostAbort()
  else hostSignal?.addEventListener('abort', onHostAbort, { once: true })
  return {
    signal: controller.signal,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer)
      hostSignal?.removeEventListener('abort', onHostAbort)
    },
  }
}

const errorStatus = (error: unknown): number | undefined => {
  if (isRecord(error) && typeof error.status === 'number') return error.status
  if (isRecord(error) && typeof error.code === 'number') return error.code
  return undefined
}

const errorCode = (error: unknown): string | undefined =>
  isRecord(error) && typeof error.code === 'string'
    ? error.code
    : undefined

const operationLeaseLost = (error: unknown): boolean =>
  errorStatus(error) === 409 && errorCode(error) === 'OPERATION_LEASE_LOST'

const providerRequestWasDispatched = (error: unknown): boolean | undefined =>
  isRecord(error) && typeof error.operationDispatched === 'boolean'
    ? error.operationDispatched
    : undefined

const definitiveProviderRejection = (error: unknown): boolean => {
  const status = errorStatus(error)
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429
}

const retryableExplicitRejection = (error: unknown): boolean => {
  const status = errorStatus(error)
  return status === 401 || status === 425 || status === 429
}

const definitiveFileReadFailure = (error: unknown): boolean => {
  const status = errorStatus(error)
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429
}

const publicationMarker = async (operationId: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(operationId))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `BF-PUB-${hex.slice(0, 20)}`
}

const contentWithMarker = (contentHtml: string, marker: string): string =>
  `${contentHtml}<br><small>Публикация: <code>${marker}</code></small>`

const attachmentIds = (
  snapshot: OperationCheckpointSnapshot,
  count: number,
): string[] | undefined => {
  const ids = Array.from({ length: count }, (_, index) => snapshot.entries[checkpointKey(index)])
  return ids.every((id): id is string => typeof id === 'string' && id.length > 0)
    ? ids
    : undefined
}

const checkpointSnapshot = (client: OperationCheckpointClient): OperationCheckpointSnapshot => ({
  version: '1',
  revision: client.revision,
  entries: client.entries,
})

const appendCheckpoint = async (
  client: OperationCheckpointClient,
  key: string,
  value: string,
): Promise<OperationCheckpointSnapshot> => {
  return client.append(key, value)
}

const recoverComment = async (
  request: PublishCaseDocumentRequest,
  provider: PublicationProvider,
  marker: string,
  snapshot: OperationCheckpointSnapshot,
  signal: AbortSignal,
): Promise<{
  snapshot: OperationCheckpointSnapshot
  commentId?: string
  checkpointError?: unknown
}> => {
  const expectedAttachmentIds = attachmentIds(snapshot, request.input.attachments.length)
  if (!expectedAttachmentIds) return { snapshot }
  const existing = await provider.findCommentByMarker(
    request.input.owner,
    request.input.ownerId,
    marker,
    expectedAttachmentIds,
    signal,
  )
  if (!existing?.id) return { snapshot }
  if (snapshot.entries.comment === existing.id) return { snapshot, commentId: existing.id }
  try {
    const updated = await appendCheckpoint(request.checkpoint, 'comment', existing.id)
    return { snapshot: updated, commentId: existing.id }
  } catch (checkpointError) {
    return { snapshot, commentId: existing.id, checkpointError }
  }
}

const successFrom = (
  snapshot: OperationCheckpointSnapshot,
  count: number,
): DurableOperationOutcome | undefined => {
  const ids = attachmentIds(snapshot, count)
  const commentId = snapshot.entries.comment
  if (!ids || !commentId) return undefined
  return { kind: 'succeeded', result: { commentId, attachmentIds: ids } }
}

const execute = async (
  request: PublishCaseDocumentRequest,
  dependencies: CaseDocumentOperationDependencies,
  signal: AbortSignal,
  logger: IntegrationLogger,
): Promise<DurableOperationOutcome> => {
  let snapshot = checkpointSnapshot(request.checkpoint)
  const count = request.input.attachments.length
  const alreadySucceeded = successFrom(snapshot, count)
  if (alreadySucceeded) return alreadySucceeded
  if (request.cancelRequestedAt !== null) {
    return Object.keys(snapshot.entries).length === 0
      ? { kind: 'cancelled' }
      : unknown('outcome_unknown', 'MEGAPLAN_PUBLICATION_CANCELLED_WITH_EFFECTS')
  }
  if (signal.aborted) return { kind: 'retry_safe' }

  for (const [index, attachment] of request.input.attachments.entries()) {
    const key = checkpointKey(index)
    if (snapshot.entries[key]) continue
    if (signal.aborted) return { kind: 'retry_safe' }

    let stream: ReadableStream<Uint8Array>
    try {
      stream = await dependencies.files.openRef(
        attachment.fileRef,
        {
          signal,
        },
      )
    } catch (error) {
      if (operationLeaseLost(error)) return { kind: 'retry_safe' }
      return definitiveFileReadFailure(error)
        ? failed('FILE_REF_REJECTED', 'Botruntime Files отклонил точную версию файла')
        : { kind: 'retry_safe' }
    }
    if (signal.aborted) return { kind: 'retry_safe' }

    const name = attachment.displayName ?? attachment.fileRef.filename!
    const mimeType = attachment.mimeType ?? attachment.fileRef.contentType ?? 'application/octet-stream'
    let uploadedId: string
    try {
      uploadedId = (await dependencies.provider.uploadFileStreamOnce(
        name,
        stream,
        attachment.fileRef.size,
        mimeType,
        signal,
      )).id
      if (!validProviderId(uploadedId)) {
        return unknown('outcome_unknown', 'MEGAPLAN_FILE_UPLOAD_OUTCOME_UNKNOWN')
      }
    } catch (error) {
      if (providerRequestWasDispatched(error) === false) return { kind: 'retry_safe' }
      if (retryableExplicitRejection(error)) return { kind: 'retry_safe' }
      if (definitiveProviderRejection(error)) {
        return failed('MEGAPLAN_FILE_UPLOAD_REJECTED', 'Megaplan отклонил загрузку файла')
      }
      return unknown('outcome_unknown', 'MEGAPLAN_FILE_UPLOAD_OUTCOME_UNKNOWN')
    }

    try {
      snapshot = await appendCheckpoint(request.checkpoint, key, uploadedId)
    } catch {
      return unknown('outcome_unknown', 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN')
    }
  }

  const ids = attachmentIds(snapshot, count)
  if (!ids) return failed('INVALID_OPERATION_CHECKPOINT', 'Контрольная точка публикации неполна')
  const marker = await publicationMarker(request.operationId)
  try {
    const recovered = await recoverComment(request, dependencies.provider, marker, snapshot, signal)
    if (recovered.checkpointError) {
      return unknown('outcome_unknown', 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN')
    }
    snapshot = recovered.snapshot
    const recoveredSuccess = successFrom(snapshot, count)
    if (recoveredSuccess) return recoveredSuccess
  } catch {
    // A failed read before comment creation is retry-safe: no comment POST has
    // started in this invocation and every uploaded ID is fenced in checkpoint.
    return { kind: 'retry_safe' }
  }

  if (signal.aborted) return { kind: 'retry_safe' }
  let commentId: string
  try {
    commentId = (await dependencies.provider.addComment(
      request.input.owner,
      request.input.ownerId,
      contentWithMarker(request.input.contentHtml, marker),
      ids,
      signal,
    )).id
    if (!validProviderId(commentId)) {
      return unknown('outcome_unknown', 'MEGAPLAN_COMMENT_OUTCOME_UNKNOWN')
    }
  } catch (error) {
    if (providerRequestWasDispatched(error) === false) return { kind: 'retry_safe' }
    if (retryableExplicitRejection(error)) return { kind: 'retry_safe' }
    if (definitiveProviderRejection(error)) {
      return failed('MEGAPLAN_COMMENT_REJECTED', 'Megaplan отклонил комментарий')
    }
    try {
      const recovered = await recoverComment(request, dependencies.provider, marker, snapshot, signal)
      if (recovered.checkpointError) {
        return unknown('outcome_unknown', 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN')
      }
      snapshot = recovered.snapshot
      const recoveredSuccess = successFrom(snapshot, count)
      if (recoveredSuccess) return recoveredSuccess
    } catch {
      // The provider POST has already crossed the ambiguity boundary.
    }
    return unknown('outcome_unknown', 'MEGAPLAN_COMMENT_OUTCOME_UNKNOWN')
  }

  try {
    snapshot = await appendCheckpoint(request.checkpoint, 'comment', commentId)
  } catch {
    return unknown('outcome_unknown', 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN')
  }
  logger.forBot().info('Megaplan: документы опубликованы в журнале дела')
  return successFrom(snapshot, count)
    ?? failed('INVALID_OPERATION_CHECKPOINT', 'Контрольная точка публикации неполна')
}

export async function handleCaseDocumentOperation(
  phase: 'execute' | 'reconcile' | 'cancel',
  request: PublishCaseDocumentRequest,
  dependencies: CaseDocumentOperationDependencies,
  logger: IntegrationLogger,
  hostSignal?: AbortSignal,
): Promise<DurableOperationOutcome> {
  if (
    request.action !== 'publishCaseDocument'
    || !request.operationId
    || !Number.isInteger(request.attempt)
    || request.attempt < 1
    || !request.idempotencyKey
    || !Number.isFinite(Date.parse(request.deadline))
    || !validatePublishCaseDocumentInput(request.input)
    || !validateCheckpoint(checkpointSnapshot(request.checkpoint), request.input.attachments.length)
  ) {
    return failed('INVALID_OPERATION', 'Некорректный контракт публикации документов')
  }

  const operation = operationController(request.deadline, hostSignal)
  try {
    if (phase === 'execute') {
      return await execute(request, dependencies, operation.signal, logger)
    }

    let snapshot = checkpointSnapshot(request.checkpoint)
    const count = request.input.attachments.length
    const alreadySucceeded = successFrom(snapshot, count)
    if (alreadySucceeded) return alreadySucceeded
    if (Object.keys(snapshot.entries).length === 0 && phase === 'cancel') {
      return { kind: 'cancelled' }
    }

    const ids = attachmentIds(snapshot, count)
    if (ids) {
      try {
        const marker = await publicationMarker(request.operationId)
        const recovered = await recoverComment(
          request,
          dependencies.provider,
          marker,
          snapshot,
          operation.signal,
        )
        if (recovered.checkpointError) {
          return unknown('still_unknown', 'MEGAPLAN_PUBLICATION_STILL_UNKNOWN')
        }
        snapshot = recovered.snapshot
        const recoveredSuccess = successFrom(snapshot, count)
        if (recoveredSuccess) return recoveredSuccess
      } catch {
        // Reconcile remains read-only at the provider boundary. A failed lookup
        // cannot justify another POST.
      }
    }
    return unknown('still_unknown', 'MEGAPLAN_PUBLICATION_STILL_UNKNOWN')
  } finally {
    operation.dispose()
  }
}
