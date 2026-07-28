import type {
  DurableOperationOutcome,
  IntegrationLogger,
  OperationCheckpointClient,
  OperationCheckpointSnapshot,
  OperationFilesClient,
  PreparedFileRefV1,
} from '@holocronlab/botruntime-sdk'
import { projectDeal } from './actions/deal'
import { projectTask } from './actions/task'
import type { MegaplanApiClient } from './megaplan-api'
import {
  ContentType,
  DateTime,
  Money,
  type Comment,
  type ContractorHuman,
  type Deal,
  type FileRef,
  type Task,
} from './types'

export const durableEntityActions = [
  'createContractorHuman',
  'createDeal',
  'createNegotiationTask',
  'createTask',
  'addComment',
] as const

export type DurableEntityAction = (typeof durableEntityActions)[number]

type ContactInfoInput = {
  type: 'phone' | 'email' | 'telegram'
  value: string
  comment?: string
}

type CreateContractorHumanInput = {
  firstName?: string
  middleName?: string
  lastName?: string
  description?: string
  contactInfo: ContactInfoInput[]
}

type CreateDealInput = {
  programId: string
  contractorId?: string
  managerId?: string
  name?: string
  description?: string
  stateId?: string
  price?: {
    value: string
    currency?: string
  }
}

type CreateTaskInput = {
  name: string
  responsibleId: string
  dealIds: string[]
  deadline?: string
  isUrgent?: boolean
  statement?: string
}

type AddCommentInput = {
  owner: 'deal' | 'contractor' | 'task'
  ownerId: string
  contentHtml: string
}

type CreateNegotiationTaskInput = {
  name: string
  responsibleId: string
  approverIds: string[]
  dealIds: string[]
  materialName: string
  materialFile: PreparedFileRefV1
  statement?: string
}

export type DurableEntityInput =
  | CreateContractorHumanInput
  | CreateDealInput
  | CreateTaskInput
  | AddCommentInput
  | CreateNegotiationTaskInput

export type DurableEntityOperationRequest = {
  operationId: string
  attempt: number
  action: DurableEntityAction
  idempotencyKey: string
  input: DurableEntityInput
  deadline: string
  cancelRequestedAt: string | null
  checkpoint: OperationCheckpointClient
}

type EntityProvider = Pick<
  MegaplanApiClient,
  | 'addComment'
  | 'createContractorHuman'
  | 'createDeal'
  | 'createNegotiationTask'
  | 'createTask'
  | 'findCommentByMarker'
  | 'findContractorHumanByMarker'
  | 'findDealByMarker'
  | 'findTaskByMarker'
  | 'getContractorHuman'
  | 'getDeal'
  | 'getTask'
  | 'uploadFileStreamOnce'
>

export type DurableEntityOperationDependencies = {
  provider: EntityProvider
  files?: OperationFilesClient
}

type ProviderEntity = Comment | ContractorHuman | Deal | Task

const MAX_FILE_BYTES = 20 << 20
const PROVIDER_ID_BYTES = 512
const DECIMAL = /^-?\d+(\.\d+)?$/
const DEADLINE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
const DISPLAY_NAME = /^[^\r\n]*[^ \t\r\n][^\r\n]*$/
const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength

const failed = (errorCode: string, errorMessage: string): DurableOperationOutcome => ({
  kind: 'failed',
  errorCode,
  errorMessage,
})

const unknown = (
  kind: 'still_unknown' | 'outcome_unknown',
  errorCode: string,
): DurableOperationOutcome => ({
  kind,
  errorCode,
  errorMessage: 'Megaplan не подтвердил итог durable-операции',
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnly = (value: Record<string, unknown>, names: string[]): boolean => {
  const allowed = new Set(names)
  return Object.keys(value).every((name) => allowed.has(name))
}

const optionalString = (value: unknown, maxLength: number): value is string | undefined =>
  value === undefined || (typeof value === 'string' && value.length <= maxLength)

const requiredString = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength

const stringArray = (
  value: unknown,
  minimum: number,
  maximum: number,
  itemMaximum = 256,
): value is string[] =>
  Array.isArray(value)
  && value.length >= minimum
  && value.length <= maximum
  && value.every((item) => requiredString(item, itemMaximum))

const validProviderId = (value: unknown): value is string =>
  typeof value === 'string'
  && utf8Bytes(value) >= 1
  && utf8Bytes(value) <= PROVIDER_ID_BYTES
  && !/[\u0000-\u001f\u007f]/.test(value)

const validateContact = (value: unknown): value is ContactInfoInput => {
  if (
    !isRecord(value)
    || !hasOnly(value, ['type', 'value', 'comment'])
    || !['phone', 'email', 'telegram'].includes(String(value.type))
    || !requiredString(value.value, 512)
    || !optionalString(value.comment, 1024)
  ) {
    return false
  }
  return true
}

const validatePreparedFileRef = (value: unknown): value is PreparedFileRefV1 => {
  if (
    !isRecord(value)
    || !hasOnly(value, ['version', 'id', 'generation', 'size', 'contentType', 'filename', 'checksum'])
  ) {
    return false
  }
  return (
    value.version === '1'
    && requiredString(value.id, 1024)
    && requiredString(value.generation, 1024)
    && Number.isSafeInteger(value.size)
    && Number(value.size) >= 1
    && Number(value.size) <= MAX_FILE_BYTES
    && optionalString(value.contentType, 255)
    && optionalString(value.filename, 1024)
    && typeof value.checksum === 'string'
    && /^sha256:[0-9a-f]{64}$/i.test(value.checksum)
  )
}

const validateContractorInput = (value: unknown): value is CreateContractorHumanInput => {
  if (
    !isRecord(value)
    || !hasOnly(value, ['firstName', 'middleName', 'lastName', 'description', 'contactInfo'])
    || !optionalString(value.firstName, 256)
    || !optionalString(value.middleName, 256)
    || !optionalString(value.lastName, 220)
    || !optionalString(value.description, 65_000)
    || !Array.isArray(value.contactInfo)
    || value.contactInfo.length > 32
  ) {
    return false
  }
  return value.contactInfo.every(validateContact)
}

const validateDealInput = (value: unknown): value is CreateDealInput => {
  if (
    !isRecord(value)
    || !hasOnly(value, [
      'programId',
      'contractorId',
      'managerId',
      'name',
      'description',
      'stateId',
      'price',
    ])
    || !requiredString(value.programId, 256)
    || !optionalString(value.contractorId, 256)
    || !optionalString(value.managerId, 256)
    || !optionalString(value.name, 960)
    || !optionalString(value.description, 65_000)
    || !optionalString(value.stateId, 256)
  ) {
    return false
  }
  if (value.price === undefined) return true
  return (
    isRecord(value.price)
    && hasOnly(value.price, ['value', 'currency'])
    && requiredString(value.price.value, 128)
    && DECIMAL.test(value.price.value)
    && (
      value.price.currency === undefined
      || requiredString(value.price.currency, 16)
    )
  )
}

const validateTaskInput = (value: unknown): value is CreateTaskInput => {
  if (
    !isRecord(value)
    || !hasOnly(value, ['name', 'responsibleId', 'dealIds', 'deadline', 'isUrgent', 'statement'])
    || !requiredString(value.name, 960)
    || !requiredString(value.responsibleId, 256)
    || !stringArray(value.dealIds, 0, 64)
    || !optionalString(value.deadline, 19)
    || (value.deadline !== undefined && !DEADLINE.test(value.deadline))
    || (value.isUrgent !== undefined && typeof value.isUrgent !== 'boolean')
    || !optionalString(value.statement, 64 * 1024)
  ) {
    return false
  }
  return true
}

const validateCommentInput = (value: unknown): value is AddCommentInput => {
  if (
    !isRecord(value)
    || !hasOnly(value, ['owner', 'ownerId', 'contentHtml'])
    || !['deal', 'contractor', 'task'].includes(String(value.owner))
    || !requiredString(value.ownerId, 256)
    || !requiredString(value.contentHtml, 65_000)
  ) {
    return false
  }
  return true
}

const validateNegotiationInput = (value: unknown): value is CreateNegotiationTaskInput => {
  if (
    !isRecord(value)
    || !hasOnly(value, [
      'name',
      'responsibleId',
      'approverIds',
      'dealIds',
      'materialName',
      'materialFile',
      'statement',
    ])
    || !requiredString(value.name, 960)
    || !requiredString(value.responsibleId, 256)
    || !stringArray(value.approverIds, 1, 32)
    || !stringArray(value.dealIds, 0, 64)
    || !requiredString(value.materialName, 1024)
    || !DISPLAY_NAME.test(value.materialName)
    || !validatePreparedFileRef(value.materialFile)
    || !optionalString(value.statement, 65_000)
  ) {
    return false
  }
  return true
}

export const validateDurableEntityInput = (
  action: DurableEntityAction,
  value: unknown,
): value is DurableEntityInput => {
  switch (action) {
    case 'createContractorHuman':
      return validateContractorInput(value)
    case 'createDeal':
      return validateDealInput(value)
    case 'createNegotiationTask':
      return validateNegotiationInput(value)
    case 'createTask':
      return validateTaskInput(value)
    case 'addComment':
      return validateCommentInput(value)
  }
}

export const isDurableEntityAction = (value: string): value is DurableEntityAction =>
  durableEntityActions.includes(value as DurableEntityAction)

const checkpointSnapshot = (client: OperationCheckpointClient): OperationCheckpointSnapshot => ({
  version: '1',
  revision: client.revision,
  entries: client.entries,
})

const validateCheckpoint = (
  snapshot: OperationCheckpointSnapshot,
  action: DurableEntityAction,
): boolean => {
  if (
    snapshot.version !== '1'
    || !Number.isSafeInteger(snapshot.revision)
    || snapshot.revision < 0
    || !isRecord(snapshot.entries)
  ) {
    return false
  }
  const allowed = action === 'createNegotiationTask'
    ? new Set(['file', 'entity'])
    : new Set(['entity'])
  if (!Object.keys(snapshot.entries).every((key) => allowed.has(key))) return false
  if (!Object.values(snapshot.entries).every(validProviderId)) return false
  return action !== 'createNegotiationTask'
    || snapshot.entries.entity === undefined
    || snapshot.entries.file !== undefined
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

const errorStatus = (error: unknown): number | undefined =>
  isRecord(error) && typeof error.status === 'number'
    ? error.status
    : isRecord(error) && typeof error.code === 'number'
      ? error.code
      : undefined

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
  return status !== undefined
    && status >= 400
    && status < 500
    && status !== 408
    && status !== 425
    && status !== 429
}

const retryableExplicitRejection = (error: unknown): boolean => {
  const status = errorStatus(error)
  return status === 401 || status === 425 || status === 429
}

const markerFor = async (
  operationId: string,
  action: DurableEntityAction,
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${action}:${operationId}`),
  )
  const hex = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
  return `BF-OP-${hex.slice(0, 24)}`
}

const plainTextWithMarker = (value: string | undefined, marker: string): string =>
  [value, `Botruntime operation: [${marker}]`].filter(Boolean).join('\n\n')

const htmlWithMarker = (value: string, marker: string): string =>
  `${value}<br><small>Botruntime operation: <code>${marker}</code></small>`

const taskNameWithMarker = (value: string, marker: string): string =>
  `${value} [${marker}]`

const optionalNameWithMarker = (value: string | undefined, marker: string): string =>
  taskNameWithMarker(value || 'Botruntime', marker)

const providerEntityId = (entity: ProviderEntity): string | undefined =>
  validProviderId(entity.id) ? entity.id : undefined

const recoveredEntity = async (
  action: DurableEntityAction,
  input: DurableEntityInput,
  marker: string,
  provider: EntityProvider,
  signal: AbortSignal,
): Promise<ProviderEntity | undefined> => {
  switch (action) {
    case 'createContractorHuman':
      return provider.findContractorHumanByMarker(marker, signal)
    case 'createDeal':
      return provider.findDealByMarker(marker, signal)
    case 'createNegotiationTask':
      return provider.findTaskByMarker(marker, true, signal)
    case 'createTask':
      return provider.findTaskByMarker(marker, false, signal)
    case 'addComment': {
      const comment = input as AddCommentInput
      return provider.findCommentByMarker(
        comment.owner,
        comment.ownerId,
        marker,
        [],
        signal,
      )
    }
  }
}

const checkpointedEntity = async (
  action: DurableEntityAction,
  input: DurableEntityInput,
  id: string,
  marker: string,
  provider: EntityProvider,
  signal: AbortSignal,
): Promise<ProviderEntity | undefined> => {
  switch (action) {
    case 'createContractorHuman': {
      const entity = await provider.getContractorHuman(id, signal)
      return entity.id === id
        && entity.lastName?.includes(`[${marker}]`)
        && entity.description?.includes(marker)
        ? entity
        : undefined
    }
    case 'createDeal': {
      const entity = await provider.getDeal(id, signal)
      return entity.id === id
        && entity.name?.includes(`[${marker}]`)
        && entity.description?.includes(marker)
        ? entity
        : undefined
    }
    case 'createNegotiationTask':
    case 'createTask': {
      const entity = await provider.getTask(id, signal)
      return entity.id === id
        && (
          action === 'createNegotiationTask'
            ? entity.isNegotiation === true
            : entity.isNegotiation !== true
        )
        && entity.name?.includes(`[${marker}]`)
        ? entity
        : undefined
    }
    case 'addComment': {
      const entity = await recoveredEntity(action, input, marker, provider, signal)
      return entity?.id === id ? entity : undefined
    }
  }
}

const createProviderEntity = async (
  request: DurableEntityOperationRequest,
  marker: string,
  provider: EntityProvider,
  signal: AbortSignal,
  materialFileId?: string,
): Promise<ProviderEntity> => {
  switch (request.action) {
    case 'createContractorHuman': {
      const input = request.input as CreateContractorHumanInput
      return provider.createContractorHuman({
        ...input,
        lastName: optionalNameWithMarker(input.lastName, marker),
        description: plainTextWithMarker(input.description, marker),
      }, signal)
    }
    case 'createDeal': {
      const input = request.input as CreateDealInput
      return provider.createDeal({
        ...input,
        name: optionalNameWithMarker(input.name, marker),
        description: plainTextWithMarker(input.description, marker),
        price: input.price
          ? new Money(input.price.value, input.price.currency ?? 'RUB')
          : undefined,
      }, signal)
    }
    case 'createNegotiationTask': {
      const input = request.input as CreateNegotiationTaskInput
      if (!materialFileId) {
        throw new Error('megaplan: durable negotiation material checkpoint is absent')
      }
      return provider.createNegotiationTask({
        name: taskNameWithMarker(input.name, marker),
        responsibleId: input.responsibleId,
        approverIds: input.approverIds,
        dealIds: input.dealIds,
        materialName: input.materialName,
        materialSha256: input.materialFile.checksum.slice('sha256:'.length).toLowerCase(),
        materialFile: {
          contentType: ContentType.File,
          id: materialFileId,
        },
        statement: plainTextWithMarker(input.statement, marker),
      }, signal)
    }
    case 'createTask': {
      const input = request.input as CreateTaskInput
      return provider.createTask({
        name: taskNameWithMarker(input.name, marker),
        responsibleId: input.responsibleId,
        dealIds: input.dealIds,
        deadline: input.deadline ? new DateTime(input.deadline) : undefined,
        isUrgent: input.isUrgent,
        statement: input.statement,
      }, signal)
    }
    case 'addComment': {
      const input = request.input as AddCommentInput
      return provider.addComment(
        input.owner,
        input.ownerId,
        htmlWithMarker(input.contentHtml, marker),
        [],
        signal,
      )
    }
  }
}

const resultFrom = (
  request: DurableEntityOperationRequest,
  entity: ProviderEntity,
): Record<string, unknown> | undefined => {
  switch (request.action) {
    case 'createContractorHuman':
    case 'addComment':
      return validProviderId(entity.id) ? { id: entity.id } : undefined
    case 'createDeal':
      if (!validProviderId(entity.id)) return undefined
      const projected = projectDeal(entity as Deal)
      const input = request.input as CreateDealInput
      return {
        deal: {
          ...projected,
          name: input.name,
          description: input.description,
        },
      }
    case 'createTask': {
      const projected = projectTask(entity as Task)
      return validProviderId(projected.id)
        ? { id: projected.id, ...(projected.status ? { status: projected.status } : {}) }
        : undefined
    }
    case 'createNegotiationTask': {
      const task = entity as Task
      if (!validProviderId(task.id)) return undefined
      const item = task.negotiationItems?.[0]
      return {
        taskId: task.id,
        ...(validProviderId(item?.id) ? { itemId: item.id } : {}),
        ...(validProviderId(item?.actualVersion?.id)
          ? { versionId: item.actualVersion.id }
          : {}),
      }
    }
  }
}

const checkpointEntity = async (
  request: DurableEntityOperationRequest,
  entity: ProviderEntity,
  signal: AbortSignal,
): Promise<OperationCheckpointSnapshot> => {
  const id = providerEntityId(entity)
  if (!id) throw new Error('megaplan: provider returned an invalid entity id')
  if (request.checkpoint.entries.entity === id) {
    return checkpointSnapshot(request.checkpoint)
  }
  return request.checkpoint.append('entity', id, { signal })
}

const successFrom = (
  request: DurableEntityOperationRequest,
  entity: ProviderEntity,
): DurableOperationOutcome => {
  const result = resultFrom(request, entity)
  return result
    ? { kind: 'succeeded', result }
    : failed('INVALID_PROVIDER_RESULT', 'Megaplan вернул некорректный результат')
}

const recoverAndCheckpoint = async (
  request: DurableEntityOperationRequest,
  provider: EntityProvider,
  marker: string,
  signal: AbortSignal,
): Promise<DurableOperationOutcome | undefined> => {
  const entity = await recoveredEntity(
    request.action,
    request.input,
    marker,
    provider,
    signal,
  )
  if (!entity) return undefined
  await checkpointEntity(request, entity, signal)
  return successFrom(request, entity)
}

const uploadNegotiationMaterial = async (
  request: DurableEntityOperationRequest,
  dependencies: DurableEntityOperationDependencies,
  signal: AbortSignal,
): Promise<DurableOperationOutcome | string> => {
  const existing = request.checkpoint.entries.file
  if (existing) return existing
  const files = dependencies.files
  const input = request.input as CreateNegotiationTaskInput
  if (!files) {
    return failed(
      'INVALID_OPERATION_CAPABILITIES',
      'Durable negotiation action не получил Files capability',
    )
  }
  let stream: ReadableStream<Uint8Array>
  try {
    stream = await files.openRef(input.materialFile, { signal })
  } catch (error) {
    if (operationLeaseLost(error)) return { kind: 'retry_safe' }
    return definitiveProviderRejection(error)
      ? failed('FILE_REF_REJECTED', 'Botruntime Files отклонил точную версию файла')
      : { kind: 'retry_safe' }
  }
  let uploaded: FileRef
  try {
    uploaded = await dependencies.provider.uploadFileStreamOnce(
      input.materialName,
      stream,
      input.materialFile.size,
      input.materialFile.contentType ?? 'application/octet-stream',
      signal,
    )
  } catch (error) {
    if (providerRequestWasDispatched(error) === false) return { kind: 'retry_safe' }
    if (retryableExplicitRejection(error)) return { kind: 'retry_safe' }
    if (definitiveProviderRejection(error)) {
      return failed(
        'MEGAPLAN_FILE_UPLOAD_REJECTED',
        'Megaplan отклонил загрузку материала согласования',
      )
    }
    return unknown(
      'outcome_unknown',
      'MEGAPLAN_NEGOTIATION_FILE_OUTCOME_UNKNOWN',
    )
  }
  if (!validProviderId(uploaded.id)) {
    return unknown(
      'outcome_unknown',
      'MEGAPLAN_NEGOTIATION_FILE_OUTCOME_UNKNOWN',
    )
  }
  try {
    await request.checkpoint.append('file', uploaded.id, { signal })
  } catch {
    return unknown('outcome_unknown', 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN')
  }
  return uploaded.id
}

const execute = async (
  request: DurableEntityOperationRequest,
  dependencies: DurableEntityOperationDependencies,
  marker: string,
  signal: AbortSignal,
  logger: IntegrationLogger,
): Promise<DurableOperationOutcome> => {
  if (request.cancelRequestedAt !== null) {
    return Object.keys(request.checkpoint.entries).length === 0
      ? { kind: 'cancelled' }
      : unknown('outcome_unknown', 'MEGAPLAN_OPERATION_CANCELLED_WITH_EFFECTS')
  }
  if (signal.aborted) return { kind: 'retry_safe' }

  let materialFileId: string | undefined
  if (request.action === 'createNegotiationTask') {
    const upload = await uploadNegotiationMaterial(request, dependencies, signal)
    if (typeof upload !== 'string') return upload
    materialFileId = upload
  }

  try {
    const recovered = await recoveredEntity(
      request.action,
      request.input,
      marker,
      dependencies.provider,
      signal,
    )
    if (recovered) {
      try {
        await checkpointEntity(request, recovered, signal)
      } catch {
        return unknown('outcome_unknown', 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN')
      }
      logger.forBot().info(`Megaplan: ${request.action} восстановлена по operation marker`)
      return successFrom(request, recovered)
    }
  } catch {
    // No POST has started in this attempt. A failed marker lookup cannot prove
    // absence, so the scheduler may retry this read-only preflight safely.
    return { kind: 'retry_safe' }
  }

  if (signal.aborted) return { kind: 'retry_safe' }
  let entity: ProviderEntity
  try {
    entity = await createProviderEntity(
      request,
      marker,
      dependencies.provider,
      signal,
      materialFileId,
    )
  } catch (error) {
    if (providerRequestWasDispatched(error) === false) return { kind: 'retry_safe' }
    if (retryableExplicitRejection(error)) return { kind: 'retry_safe' }
    if (definitiveProviderRejection(error)) {
      return failed(
        'MEGAPLAN_OPERATION_REJECTED',
        `Megaplan отклонил ${request.action}`,
      )
    }
    try {
      const recovered = await recoveredEntity(
        request.action,
        request.input,
        marker,
        dependencies.provider,
        signal,
      )
      if (recovered) {
        try {
          await checkpointEntity(request, recovered, signal)
        } catch {
          return unknown('outcome_unknown', 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN')
        }
        logger.forBot().info(`Megaplan: ${request.action} восстановлена после неоднозначного POST`)
        return successFrom(request, recovered)
      }
    } catch {
      // The provider boundary has already been crossed. Reconciliation remains
      // read-only and a failed lookup can never authorize a second POST.
    }
    return unknown('outcome_unknown', 'MEGAPLAN_OPERATION_OUTCOME_UNKNOWN')
  }

  if (!providerEntityId(entity)) {
    return unknown('outcome_unknown', 'MEGAPLAN_OPERATION_OUTCOME_UNKNOWN')
  }
  try {
    await checkpointEntity(request, entity, signal)
  } catch {
    return unknown('outcome_unknown', 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN')
  }
  logger.forBot().info(`Megaplan: ${request.action} подтверждена`)
  return successFrom(request, entity)
}

export async function handleDurableEntityOperation(
  phase: 'execute' | 'reconcile' | 'cancel',
  request: DurableEntityOperationRequest,
  dependencies: DurableEntityOperationDependencies,
  logger: IntegrationLogger,
  hostSignal?: AbortSignal,
): Promise<DurableOperationOutcome> {
  const snapshot = checkpointSnapshot(request.checkpoint)
  if (
    !request.operationId
    || !Number.isInteger(request.attempt)
    || request.attempt < 1
    || !request.idempotencyKey
    || !Number.isFinite(Date.parse(request.deadline))
    || !validateDurableEntityInput(request.action, request.input)
    || !validateCheckpoint(snapshot, request.action)
  ) {
    return failed('INVALID_OPERATION', 'Некорректный durable-контракт Megaplan action')
  }

  const operation = operationController(request.deadline, hostSignal)
  try {
    const marker = await markerFor(request.operationId, request.action)
    if (snapshot.entries.entity) {
      try {
        const recovered = await checkpointedEntity(
          request.action,
          request.input,
          snapshot.entries.entity,
          marker,
          dependencies.provider,
          operation.signal,
        )
        if (recovered?.id === snapshot.entries.entity) {
          return successFrom(request, recovered)
        }
      } catch {
        // A confirmed provider id remains fenced in checkpoint. Failure to read
        // the provider cannot authorize another mutation.
      }
      return unknown(
        phase === 'execute' ? 'outcome_unknown' : 'still_unknown',
        'MEGAPLAN_CHECKPOINTED_ENTITY_UNAVAILABLE',
      )
    }

    if (phase === 'execute') {
      return execute(
        request,
        dependencies,
        marker,
        operation.signal,
        logger,
      )
    }

    if (
      request.action === 'createNegotiationTask'
      && !snapshot.entries.file
    ) {
      return unknown(
        'still_unknown',
        'MEGAPLAN_NEGOTIATION_FILE_STILL_UNKNOWN',
      )
    }

    try {
      const recovered = await recoverAndCheckpoint(
        request,
        dependencies.provider,
        marker,
        operation.signal,
      )
      if (recovered) return recovered
    } catch {
      // Reconcile is provider-read-only. A failed or ambiguous lookup stays
      // unknown and is left for the operator/retention path.
    }
    return unknown('still_unknown', 'MEGAPLAN_OPERATION_STILL_UNKNOWN')
  } finally {
    operation.dispose()
  }
}
