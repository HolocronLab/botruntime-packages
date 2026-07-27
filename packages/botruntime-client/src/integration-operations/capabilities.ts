import type * as types from '../types'

const MAX_RESPONSE_BYTES = 64 * 1024
const MAX_OPERATION_ID_BYTES = 1024
const MAX_FILE_REF_TEXT_BYTES = 1024
const MAX_CHECKPOINT_ENTRIES = 32
const MAX_CHECKPOINT_VALUE_BYTES = 512
const FILE_REF_CHECKSUM = /^sha256:[0-9a-f]{64}$/i
const CHECKPOINT_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/

export type FileRefV1 = Readonly<{
  version: '1'
  id: string
  generation: string
  checksum: `sha256:${string}`
  size: number
  contentType?: string
  filename?: string
}>

export type OperationFileRange = Readonly<{
  start: number
  end?: number
}>

export type OperationFileStat = Readonly<{
  size: number
  checksum: string
  contentType?: string
}>

export type OperationFilesClient = Readonly<{
  openRef(
    ref: FileRefV1,
    options?: { range?: OperationFileRange; signal?: AbortSignal }
  ): Promise<ReadableStream<Uint8Array>>
  statRef(ref: FileRefV1, options?: { signal?: AbortSignal }): Promise<OperationFileStat>
}>

export type OperationCheckpointSnapshot = Readonly<{
  version: '1'
  revision: number
  entries: Readonly<Record<string, string>>
}>

export type OperationCheckpointClient = Readonly<{
  readonly revision: number
  readonly entries: Readonly<Record<string, string>>
  append(key: string, value: string, options?: { signal?: AbortSignal }): Promise<OperationCheckpointSnapshot>
}>

export class OperationCapabilityError extends Error {
  public readonly status: number
  public readonly code?: string

  public constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'OperationCapabilityError'
    this.status = status
    this.code = code
  }
}

type TransportOptions = Readonly<{
  config: Readonly<types.ClientConfig>
  operationId: string
  fetchImpl?: typeof fetch
}>

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength

const isNonEmptyBounded = (value: unknown, maxBytes: number): value is string =>
  typeof value === 'string' && utf8Bytes(value) >= 1 && utf8Bytes(value) <= maxBytes

const validateOperationId = (operationId: string): void => {
  if (!isNonEmptyBounded(operationId, MAX_OPERATION_ID_BYTES)) {
    throw new TypeError('operationId must be a non-empty bounded string')
  }
}

const operationAuthorization = (config: Readonly<types.ClientConfig>): string => {
  const authorization = Object.entries(config.headers)
    .find(([name]) => name.toLowerCase() === 'authorization')?.[1]
  if (typeof authorization !== 'string' || !/^Bearer \S+$/.test(authorization)) {
    throw new TypeError('operation-scoped authorization is missing')
  }
  return authorization
}

const validateFileRefV1 = (ref: FileRefV1): void => {
  if (
    typeof ref !== 'object'
    || ref === null
    || ref.version !== '1'
    || !isNonEmptyBounded(ref.id, MAX_FILE_REF_TEXT_BYTES)
    || !isNonEmptyBounded(ref.generation, MAX_FILE_REF_TEXT_BYTES)
    || typeof ref.checksum !== 'string'
    || !FILE_REF_CHECKSUM.test(ref.checksum)
    || !Number.isSafeInteger(ref.size)
    || ref.size < 0
    || (
      ref.contentType !== undefined
      && (!isNonEmptyBounded(ref.contentType, 255) || /[\r\n]/.test(ref.contentType))
    )
    || (
      ref.filename !== undefined
      && (!isNonEmptyBounded(ref.filename, MAX_FILE_REF_TEXT_BYTES) || /[\r\n]/.test(ref.filename))
    )
  ) {
    throw new TypeError('fileRef must contain a valid authoritative FileRefV1 generation')
  }
}

const validateRange = (range: OperationFileRange | undefined, size: number): void => {
  if (range === undefined) return
  if (
    !Number.isSafeInteger(range.start)
    || range.start < 0
    || range.start >= size
    || (
      range.end !== undefined
      && (
        !Number.isSafeInteger(range.end)
        || range.end < range.start
        || range.end >= size
      )
    )
  ) {
    throw new TypeError('operation file range is invalid')
  }
}

const readBoundedText = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    size += value.byteLength
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error(`Operation capability request failed with status ${response.status}`)
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

const capabilityError = async (response: Response): Promise<OperationCapabilityError> => {
  let message = `Operation capability request failed with status ${response.status}`
  let code: string | undefined
  try {
    const text = await readBoundedText(response)
    const body: unknown = text ? JSON.parse(text) : undefined
    if (
      typeof body === 'object'
      && body !== null
      && 'message' in body
      && typeof body.message === 'string'
      && isNonEmptyBounded(body.message, 1024)
    ) {
      message = body.message
    }
    if (
      typeof body === 'object'
      && body !== null
      && 'code' in body
      && isNonEmptyBounded(body.code, 128)
    ) {
      code = body.code
    }
  } catch {
    // Never include the operation token or checkpoint contents in a synthesized
    // error when the response is malformed.
  }
  return new OperationCapabilityError(response.status, message, code)
}

const emptyStream = (): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })

const fileContentUrl = (config: Readonly<types.ClientConfig>, operationId: string, generation: string): URL =>
  new URL(
    `/v1/integration-operations/${encodeURIComponent(operationId)}/files/${encodeURIComponent(generation)}/content`,
    config.apiUrl
  )

export const createOperationFilesClient = (
  options: TransportOptions
): OperationFilesClient => {
  const { config, operationId, fetchImpl = fetch } = options
  validateOperationId(operationId)
  const authorization = operationAuthorization(config)

  return Object.freeze({
    async openRef(
      ref: FileRefV1,
      openOptions?: { range?: OperationFileRange; signal?: AbortSignal }
    ): Promise<ReadableStream<Uint8Array>> {
      validateFileRefV1(ref)
      validateRange(openOptions?.range, ref.size)
      const headers = new Headers({ authorization })
      if (openOptions?.range) {
        headers.set('range', `bytes=${openOptions.range.start}-${openOptions.range.end ?? ''}`)
        headers.set('if-range', `"${ref.checksum}"`)
      }
      const response = await fetchImpl(fileContentUrl(config, operationId, ref.generation), {
        method: 'GET',
        headers,
        credentials: config.withCredentials ? 'include' : 'same-origin',
        signal: openOptions?.signal,
      })
      const expectedStatus = openOptions?.range ? 206 : 200
      if (response.status !== expectedStatus) throw await capabilityError(response)

      const declaredSize = response.headers.get('content-length')
      const expectedSize = openOptions?.range
        ? (openOptions.range.end ?? (ref.size - 1)) - openOptions.range.start + 1
        : ref.size
      if (
        declaredSize === null
        || !/^\d+$/.test(declaredSize)
        || Number(declaredSize) !== expectedSize
      ) {
        await response.body?.cancel()
        throw new Error('operation file response length does not match FileRefV1')
      }
      const etag = response.headers.get('etag')
      if (etag !== `"${ref.checksum}"`) {
        await response.body?.cancel()
        throw new Error('operation file response checksum does not match FileRefV1')
      }
      if (response.headers.get('accept-ranges') !== 'bytes') {
        await response.body?.cancel()
        throw new Error('operation file response does not advertise bounded byte ranges')
      }
      if (ref.contentType && response.headers.get('content-type') !== ref.contentType) {
        await response.body?.cancel()
        throw new Error('operation file response content type does not match FileRefV1')
      }
      return response.body ?? emptyStream()
    },

    async statRef(ref: FileRefV1, statOptions?: { signal?: AbortSignal }): Promise<OperationFileStat> {
      validateFileRefV1(ref)
      const response = await fetchImpl(fileContentUrl(config, operationId, ref.generation), {
        method: 'HEAD',
        headers: { authorization },
        credentials: config.withCredentials ? 'include' : 'same-origin',
        signal: statOptions?.signal,
      })
      if (!response.ok) throw await capabilityError(response)

      const declaredSize = response.headers.get('content-length')
      if (declaredSize === null || !/^\d+$/.test(declaredSize) || Number(declaredSize) !== ref.size) {
        throw new Error('operation file metadata length does not match FileRefV1')
      }
      if (response.headers.get('etag') !== `"${ref.checksum}"`) {
        throw new Error('operation file metadata checksum does not match FileRefV1')
      }
      if (response.headers.get('accept-ranges') !== 'bytes') {
        throw new Error('operation file metadata does not advertise bounded byte ranges')
      }
      const contentType = response.headers.get('content-type')
      if (ref.contentType && contentType !== ref.contentType) {
        throw new Error('operation file metadata content type does not match FileRefV1')
      }
      return Object.freeze({
        size: ref.size,
        checksum: ref.checksum,
        ...(contentType ? { contentType } : {}),
      })
    },
  })
}

const validateCheckpointEntries = (entries: unknown): entries is Record<string, string> => {
  if (
    typeof entries !== 'object'
    || entries === null
    || Array.isArray(entries)
    || Object.keys(entries).length > MAX_CHECKPOINT_ENTRIES
  ) {
    return false
  }
  return Object.entries(entries).every(([key, value]) =>
    CHECKPOINT_KEY.test(key)
    && isNonEmptyBounded(value, MAX_CHECKPOINT_VALUE_BYTES)
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
  )
}

export const validateOperationCheckpointSnapshot = (
  value: unknown
): OperationCheckpointSnapshot => {
  if (
    typeof value !== 'object'
    || value === null
    || !('version' in value)
    || value.version !== '1'
    || !('revision' in value)
    || !Number.isSafeInteger(value.revision)
    || Number(value.revision) < 0
    || !('entries' in value)
    || !validateCheckpointEntries(value.entries)
  ) {
    throw new TypeError('operation checkpoint snapshot is invalid')
  }
  return Object.freeze({
    version: '1',
    revision: Number(value.revision),
    entries: Object.freeze({ ...value.entries }),
  })
}

const checkpointBody = async (response: Response): Promise<OperationCheckpointSnapshot> => {
  const text = await readBoundedText(response)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error('operation checkpoint returned malformed JSON')
  }
  if (
    typeof body !== 'object'
    || body === null
    || !('checkpoint' in body)
  ) {
    throw new Error('operation checkpoint response is missing its snapshot')
  }
  return validateOperationCheckpointSnapshot(body.checkpoint)
}

export const createOperationCheckpointClient = (
  options: TransportOptions & { snapshot: OperationCheckpointSnapshot }
): OperationCheckpointClient => {
  const { config, operationId, fetchImpl = fetch } = options
  validateOperationId(operationId)
  const authorization = operationAuthorization(config)
  let snapshot = validateOperationCheckpointSnapshot(options.snapshot)
  let tail: Promise<void> = Promise.resolve()

  const appendExact = async (
    key: string,
    value: string,
    signal?: AbortSignal
  ): Promise<OperationCheckpointSnapshot> => {
    if (!CHECKPOINT_KEY.test(key) || !validateCheckpointEntries({ [key]: value })) {
      throw new TypeError('operation checkpoint append is invalid')
    }
    const body = JSON.stringify({
      expectedRevision: snapshot.revision,
      entries: { [key]: value },
    })
    const send = async (): Promise<Response> => fetchImpl(
      new URL(`/v1/integration-operations/${encodeURIComponent(operationId)}/checkpoint`, config.apiUrl),
      {
        method: 'POST',
        headers: {
          authorization,
          'content-type': 'application/json',
        },
        credentials: config.withCredentials ? 'include' : 'same-origin',
        signal,
        body,
      }
    )

    let response: Response
    try {
      response = await send()
      if (response.status >= 500) {
        await response.body?.cancel()
        response = await send()
      }
    } catch {
      // The first request may have committed before its response was lost.
      // Repeating the exact body is safe by the checkpoint v1 replay contract.
      response = await send()
    }
    if (!response.ok) throw await capabilityError(response)
    snapshot = await checkpointBody(response)
    return snapshot
  }

  const client = {
    get revision(): number {
      return snapshot.revision
    },
    get entries(): Readonly<Record<string, string>> {
      return snapshot.entries
    },
    append(key: string, value: string, appendOptions?: { signal?: AbortSignal }): Promise<OperationCheckpointSnapshot> {
      // expectedRevision makes appends sequential. A rejected append must not
      // poison later calls; they continue from the last confirmed snapshot.
      const result = tail.then(() => appendExact(key, value, appendOptions?.signal))
      tail = result.then(() => undefined, () => undefined)
      return result
    },
  }
  return Object.freeze(client)
}
