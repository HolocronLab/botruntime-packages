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

export type TelegramDocument = string | { source: Buffer; filename: string }

// Telegram's servers cannot fetch our protected file-store URLs because they do not have the
// runtime bearer token. Fetch only URLs owned by this Botruntime deployment here, then hand the
// bytes to Telegram. Public third-party URLs remain URLs so credentials can never cross origins.
export async function resolveTelegramDocument(fileUrl: string, title?: string): Promise<TelegramDocument> {
  const trustedBases = [process.env.BP_API_URL, process.env.CLOUDAPI_PUBLIC_BASE_URL]
  const trusted = trustedBases.some((base) => sameOrigin(fileUrl, base))
  if (!trusted && telegramCanFetchDocument(fileUrl)) return fileUrl

  const headers: Record<string, string> = {}
  if (trusted) {
    const token = process.env.BP_TOKEN
    const botId = process.env.BP_BOT_ID
    if (!token || !botId) {
      throw new Error('telegram: missing BP_TOKEN/BP_BOT_ID for protected file delivery')
    }
    headers.authorization = `Bearer ${token}`
    headers['x-bot-id'] = botId
  } else if (!isHttpUrl(fileUrl)) {
    return fileUrl
  }

  const response = await fetch(fileUrl, { headers })
  if (!response.ok) {
    throw new Error(`telegram: protected file download -> ${response.status}`)
  }
  const source = Buffer.from(await response.arrayBuffer())
  if (source.byteLength === 0) {
    throw new Error('telegram: protected file download returned an empty document')
  }
  return { source, filename: title?.trim() || filenameFromUrl(fileUrl) }
}

function telegramCanFetchDocument(url: string): boolean {
  try {
    return /\.(gif|pdf|zip)$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

function isHttpUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
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

// Download the bytes behind a (token-bearing, server-side-only) Telegram file URL, push them into
// cloudapi, and return the token-free download URL the bot/platform will see.
export async function ingestTelegramFileLink(fileLink: string, key: string, contentType: string): Promise<string> {
  const dl = await fetch(fileLink)
  if (!dl.ok) {
    throw new Error(`telegram: file download -> ${dl.status}`)
  }
  const bytes = new Uint8Array(await dl.arrayBuffer())

  const { base, headers } = cloudApi()
  const upsertRes = await fetch(`${base}/v1/files`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ key, size: bytes.byteLength, contentType }),
  })
  if (!upsertRes.ok) {
    throw new Error(`telegram: upsert file -> ${upsertRes.status}`)
  }
  const reg = (await upsertRes.json()) as { file?: { uploadUrl?: string; url?: string } }
  if (!reg.file?.uploadUrl || !reg.file.url) {
    throw new Error('telegram: upsert file did not return upload/download urls')
  }

  const putRes = await fetch(reg.file.uploadUrl, {
    method: 'PUT',
    headers: { authorization: headers.authorization, 'x-bot-id': headers['x-bot-id']!, 'content-type': contentType },
    body: bytes,
  })
  if (!putRes.ok) {
    throw new Error(`telegram: upload file bytes -> ${putRes.status}`)
  }
  return reg.file.url
}
