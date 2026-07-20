import { protectedDownloadError } from './delivery-outcome'

// Inbound-media byte-ingest. DELIBERATE divergence from the donor, which returns Telegram
// getFileLink() URLs that embed the bot token — forbidden by our invariant (CLAUDE.md ПДн/секреты:
// "Telegram-токен не светить в URL'ах, отдаваемых вовне; медиа качаем сами и передаём байтами").
// We download the bytes SERVER-SIDE (the token-bearing Telegram URL never leaves this process) and
// re-publish them through our cloudapi's two-phase file store (the SAME PUT /v1/files contract the
// prior thin bundle proved live), returning a server-controlled URL with no token in it.
//
// cloudapi creds come from the host env overlay (env.ts integrationEnvOverlay): BP_API_URL /
// BP_TOKEN / BP_BOT_ID. Fail loud if absent — a media update we cannot ingest must surface, not
// drop the client's document silently.

type CloudApi = {
  base: string
  headers: { authorization: string; 'x-bot-id': string; 'content-type': string }
}

function cloudApi(): CloudApi {
  const base = process.env.BP_API_URL
  const token = process.env.BP_TOKEN
  const botId = process.env.BP_BOT_ID
  if (!base || !token || !botId) {
    throw new Error('telegram: missing BP_API_URL/BP_TOKEN/BP_BOT_ID for file ingest')
  }
  return {
    base: base.replace(/\/+$/, ''),
    headers: { authorization: `Bearer ${token}`, 'x-bot-id': botId, 'content-type': 'application/json' },
  }
}

export type TelegramMedia = string | { source: Buffer; filename: string }
export type TelegramDocument = TelegramMedia

const MAX_TELEGRAM_MEDIA_BYTES = 20 << 20
const FILE_TRANSFER_TIMEOUT_MS = 20_000

export type IngestedTelegramFile = {
  id: string
  url: string
  size: number
  contentType: string
}

export type TelegramFileMetadata = {
  providerFileId?: string
  providerFileUniqueId?: string
  providerMessageId?: string
  providerMediaGroupId?: string
  filename?: string
}

// Telegram's servers cannot fetch our protected file-store URLs because they do not have the
// runtime bearer token. Fetch only the canonical file-download route owned by this Botruntime
// deployment, then hand the bytes to Telegram. This applies to every outbound media kind, not only
// documents: Telegraf's sendPhoto/sendAudio/sendVideo URL path has the same authentication gap.
// Every other URL remains a URL, so credentials can never reach another origin or an unrelated
// Botruntime API route.
export async function resolveTelegramMedia(fileUrl: string, title?: string, operation = 'sendDocument'): Promise<TelegramMedia> {
  const trustedBases = [process.env.BP_API_URL, process.env.CLOUDAPI_PUBLIC_BASE_URL]
  const trusted = trustedBases.some((base) => isBotruntimeFileDownload(fileUrl, base))
  if (!trusted) return fileUrl

  const headers: Record<string, string> = {}
  const token = process.env.BP_TOKEN
  const botId = process.env.BP_BOT_ID
  if (!token || !botId) {
    throw protectedDownloadError(undefined, operation, 'PROTECTED_DOWNLOAD_AUTH_MISSING')
  }
  headers.authorization = `Bearer ${token}`
  headers['x-bot-id'] = botId

  const publicUrl = new URL(fileUrl)
  const internalUrl = new URL(`${publicUrl.pathname}${publicUrl.search}`, process.env.BP_API_URL).toString()
  let response: Response
  try {
    response = await fetch(internalUrl, { headers, signal: AbortSignal.timeout(FILE_TRANSFER_TIMEOUT_MS) })
  } catch (error) {
    throw protectedDownloadError(error, operation, 'PROTECTED_DOWNLOAD_FAILED')
  }
  if (!response.ok) {
    throw protectedDownloadError(undefined, operation, `PROTECTED_DOWNLOAD_HTTP_${response.status}`)
  }
  let source: Buffer
  try {
    source = await readProtectedMediaCapped(response)
  } catch (error) {
    throw protectedDownloadError(error, operation, 'PROTECTED_DOWNLOAD_INVALID_BODY')
  }
  if (source.byteLength === 0) {
    throw protectedDownloadError(undefined, operation, 'PROTECTED_DOWNLOAD_EMPTY')
  }
  return { source, filename: title?.trim() || filenameFromUrl(fileUrl) }
}

// Compatibility name retained for callers/tests that model the file-message subtype explicitly.
export const resolveTelegramDocument = resolveTelegramMedia

function isBotruntimeFileDownload(url: string, base: string | undefined): boolean {
  if (!sameOrigin(url, base)) return false
  try {
    const parsed = new URL(url)
    return parsed.pathname === '/v1/files/download' && Boolean(parsed.searchParams.get('key')?.trim())
  } catch {
    return false
  }
}

async function readProtectedMediaCapped(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_TELEGRAM_MEDIA_BYTES) throw mediaTooLarge()
  if (!response.body) return Buffer.alloc(0)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_TELEGRAM_MEDIA_BYTES) throw mediaTooLarge()
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const output = Buffer.allocUnsafe(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function mediaTooLarge(): Error {
  return new Error('telegram: protected media exceeds the 20 MiB limit')
}

function sameOrigin(url: string, base: string | undefined): boolean {
  if (!base) return false
  try {
    return new URL(url).origin === new URL(base).origin
  } catch {
    return false
  }
}

function filenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const fileKey = parsed.searchParams.get('key')
    const keyedName = fileKey?.split('/').filter(Boolean).at(-1)
    if (keyedName) return keyedName
    const pathName = parsed.pathname.split('/').filter(Boolean).at(-1)
    return pathName ? decodeURIComponent(pathName) : 'document'
  } catch {
    return 'document'
  }
}

export async function ingestTelegramFileLink(
  fileLink: string,
  key: string,
  contentType: string,
  providerMetadata: TelegramFileMetadata = {},
): Promise<IngestedTelegramFile> {
  const existing = await getStoredFile(key)
  if (existing) return existing

  const dl = await fetch(fileLink, { signal: AbortSignal.timeout(FILE_TRANSFER_TIMEOUT_MS) })
  if (!dl.ok) {
    throw new Error(`telegram: file download -> ${dl.status}`)
  }
  const bytes = await readInboundMediaCapped(dl)

  const { base, headers } = cloudApi()
  const upsertRes = await fetch(`${base}/v1/files`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      key,
      size: bytes.byteLength,
      contentType,
      metadata: compactObject({ source: 'telegram', ...providerMetadata, declaredContentType: contentType }),
    }),
  })
  if (!upsertRes.ok) {
    throw new Error(`telegram: upsert file -> ${upsertRes.status}`)
  }
  const reg = (await upsertRes.json()) as { file?: { id?: string; uploadUrl?: string; url?: string } }
  if (!reg.file?.id || !reg.file.uploadUrl || !reg.file.url) {
    throw new Error('telegram: upsert file did not return upload/download urls')
  }

  const putRes = await fetch(reg.file.uploadUrl, {
    method: 'PUT',
    headers: { authorization: headers.authorization, 'x-bot-id': headers['x-bot-id']!, 'content-type': contentType },
    body: bytes,
  })
  if (putRes.status === 409) {
    const winner = await waitForStoredFile(key)
    if (winner) return winner
  }
  if (!putRes.ok) {
    throw new Error(`telegram: upload file bytes -> ${putRes.status}`)
  }
  return { id: reg.file.id, url: reg.file.url, size: bytes.byteLength, contentType }
}

type CloudFileResponse = {
  file?: {
    id?: string
    url?: string
    size?: number | null
    contentType?: string
    status?: string
  }
}

async function getStoredFile(key: string): Promise<IngestedTelegramFile | undefined> {
  const { base, headers } = cloudApi()
  const response = await fetch(`${base}/v1/files/${encodeURIComponent(key)}`, {
    headers: { authorization: headers.authorization, 'x-bot-id': headers['x-bot-id']! },
    signal: AbortSignal.timeout(FILE_TRANSFER_TIMEOUT_MS),
  })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`telegram: get file -> ${response.status}`)
  const { file } = (await response.json()) as CloudFileResponse
  if (!file?.id || !file.url || typeof file.size !== 'number' || !file.contentType) return undefined
  if (file.status === 'upload_pending' || file.status === 'upload_failed') return undefined
  return { id: file.id, url: file.url, size: file.size, contentType: file.contentType }
}

async function waitForStoredFile(key: string): Promise<IngestedTelegramFile | undefined> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const file = await getStoredFile(key)
    if (file) return file
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return undefined
}

async function readInboundMediaCapped(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_TELEGRAM_MEDIA_BYTES) throw inboundMediaTooLarge()
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_TELEGRAM_MEDIA_BYTES) throw inboundMediaTooLarge()
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function inboundMediaTooLarge(): Error {
  return new Error('telegram: inbound media exceeds the 20 MiB limit')
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}
