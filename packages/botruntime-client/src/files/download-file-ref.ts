import type * as types from '../types'

export const MAX_FILE_REF_BYTES = 1 << 30

export type ExactFileRef = {
  id: string
  size: number
  contentType?: string
  filename?: string
  checksum: string
}

export type DownloadFileRefInput = {
  fileRef: ExactFileRef
  signal?: AbortSignal
}

export type DownloadFileRefOutput = {
  stream: ReadableStream<Uint8Array>
  fileRef: ExactFileRef
}

export class DownloadFileRefError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
    public readonly errorCode?: string,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'DownloadFileRefError'
  }
}

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength

const appendHeaders = (target: Headers, source: types.Headers): void => {
  for (const [name, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      for (const item of value) target.append(name, item)
    } else {
      target.set(name, value)
    }
  }
}

const validateFileRef = (fileRef: ExactFileRef): void => {
  if (
    typeof fileRef.id !== 'string'
    || fileRef.id.length === 0
    || utf8Bytes(fileRef.id) > 1024
    || !Number.isSafeInteger(fileRef.size)
    || fileRef.size < 0
    || fileRef.size > MAX_FILE_REF_BYTES
    || typeof fileRef.checksum !== 'string'
    || fileRef.checksum.length === 0
    || utf8Bytes(fileRef.checksum) > 128
    || (
      fileRef.contentType !== undefined
      && (typeof fileRef.contentType !== 'string' || utf8Bytes(fileRef.contentType) > 255)
    )
    || (
      fileRef.filename !== undefined
      && (typeof fileRef.filename !== 'string' || utf8Bytes(fileRef.filename) > 1024)
    )
  ) {
    throw new TypeError('fileRef must contain a valid immutable file generation')
  }
}

const readBoundedError = async (response: Response): Promise<unknown> => {
  const limit = 64 * 1024
  const reader = response.body?.getReader()
  if (!reader) return new Error(`Request failed with status ${response.status} and empty body`)

  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return new Error(`Request failed with status ${response.status} and an oversized error body`)
    }
    chunks.push(value)
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  const text = new TextDecoder().decode(body)
  if (text.length === 0) return new Error(`Request failed with status ${response.status} and empty body`)
  try {
    return JSON.parse(text)
  } catch {
    return new Error(`Request failed with status ${response.status}`)
  }
}

const emptyStream = (): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })

/**
 * Opens the exact immutable file generation as a raw byte stream.
 *
 * The response body is never converted to JSON, base64, an ArrayBuffer, or a
 * Buffer. The caller owns the returned stream and may pipe it directly to a
 * provider request. Supplying an AbortSignal is the supported way to stop an
 * in-flight transfer.
 */
export const downloadFileRef = async (
  config: Readonly<types.ClientConfig>,
  { fileRef, signal }: DownloadFileRefInput,
  fetchImpl: typeof fetch = fetch
): Promise<DownloadFileRefOutput> => {
  validateFileRef(fileRef)

  const url = new URL('/v1/files/download-ref', config.apiUrl)
  url.searchParams.set('id', fileRef.id)
  url.searchParams.set('size', String(fileRef.size))
  if (fileRef.contentType !== undefined) url.searchParams.set('contentType', fileRef.contentType)
  if (fileRef.filename !== undefined) url.searchParams.set('filename', fileRef.filename)
  url.searchParams.set('checksum', fileRef.checksum)
  if (utf8Bytes(url.search.slice(1)) > 4 * 1024) {
    throw new TypeError('fileRef query exceeds the 4 KiB endpoint limit')
  }

  const headers = new Headers()
  appendHeaders(headers, config.headers)
  const response = await fetchImpl(url, {
    method: 'GET',
    headers,
    credentials: config.withCredentials ? 'include' : 'same-origin',
    signal,
  })
  if (!response.ok) {
    const payload = await readBoundedError(response)
    const envelope =
      typeof payload === 'object' && payload !== null
        ? payload as { message?: unknown; metadata?: unknown }
        : undefined
    const metadata =
      typeof envelope?.metadata === 'object'
      && envelope.metadata !== null
      && !Array.isArray(envelope.metadata)
        ? envelope.metadata as Record<string, unknown>
        : undefined
    throw new DownloadFileRefError(
      response.status,
      typeof envelope?.message === 'string'
        ? envelope.message
        : `Request failed with status ${response.status}`,
      typeof metadata?.errorCode === 'string' ? metadata.errorCode : undefined,
      metadata,
    )
  }

  const declaredSize = response.headers.get('content-length')
  if (
    declaredSize !== null
    && (!/^\d+$/.test(declaredSize) || Number(declaredSize) !== fileRef.size)
  ) {
    await response.body?.cancel()
    throw new Error('fileRef response content-length does not match the immutable generation')
  }

  return {
    stream: response.body ?? emptyStream(),
    fileRef: { ...fileRef },
  }
}
