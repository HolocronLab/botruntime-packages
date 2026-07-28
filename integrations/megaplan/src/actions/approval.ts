import { RuntimeError } from '@holocronlab/botruntime-sdk'
import type { IntegrationProps } from '../bp'
import { buildClient, run } from './shared'

export const createNegotiationTask: IntegrationProps['actions']['createNegotiationTask'] = async () => {
  throw new RuntimeError('createNegotiationTask: используйте startIntegrationOperation с immutable FileRef')
}

export const getNegotiationDecision: IntegrationProps['actions']['getNegotiationDecision'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const decision = await api.getNegotiationDecision(input.taskId)
    if (decision.status !== 'approved') return decision
    if (!decision.filePath) throw new Error('megaplan: approved actual version has no attached file')
    const file = await api.downloadFile(decision.filePath)
    if (file.bytes.byteLength === 0) throw new Error('megaplan: empty approved attachment')
    const fileSha256 = await sha256(file.bytes)
    const approvedFile = await publishApprovedFile(
      input.taskId,
      decision.versionId ?? decision.fileId ?? 'actual',
      decision.fileName ?? 'approved.bin',
      file.bytes,
      file.contentType,
    )
    return {
      ...decision,
      fileUrl: approvedFile.url,
      approvedFileId: approvedFile.id,
      approvedFileKey: approvedFile.key,
      fileSha256,
    }
  })

type PublishedFile = {
  id: string
  key: string
  url: string
}

async function publishApprovedFile(
  taskId: string,
  versionId: string,
  fileName: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<PublishedFile> {
  const base = process.env.BP_API_URL?.replace(/\/+$/, '')
  const token = process.env.BP_TOKEN
  const botId = process.env.BP_BOT_ID
  if (!base || !token || !botId) throw new Error('megaplan: missing Botruntime file-store environment')
  const key = `megaplan/approvals/${taskId}/${versionId}/${fileName.replace(/[^a-zA-Z0-9._-]+/g, '_')}`
  const headers = { authorization: `Bearer ${token}`, 'x-bot-id': botId, 'content-type': 'application/json' }
  const registered = await fetch(`${base}/v1/files`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ key, size: bytes.byteLength, contentType }),
  })
  if (!registered.ok) throw new Error(`megaplan: register approved file -> ${registered.status}`)
  const payload = (await registered.json()) as { file?: { id?: string; key?: string; uploadUrl?: string } }
  if (!payload.file?.id || !payload.file.key || !payload.file.uploadUrl) {
    throw new Error('megaplan: file store returned no stable file reference or upload URL')
  }
  const uploaded = await fetch(payload.file.uploadUrl, {
    method: 'PUT',
    headers: botruntimeHeadersForUrl(payload.file.uploadUrl, contentType),
    body: bytes,
  })
  if (!uploaded.ok) throw new Error(`megaplan: upload approved file -> ${uploaded.status}`)
  const downloadBase = process.env.CLOUDAPI_PUBLIC_BASE_URL?.replace(/\/+$/, '') || base
  const downloadUrl = new URL('/v1/files/download', `${downloadBase}/`)
  downloadUrl.searchParams.set('key', payload.file.key)
  return { id: payload.file.id, key: payload.file.key, url: downloadUrl.toString() }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer as ArrayBuffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isBotruntimeOrigin(url: string): boolean {
  return botruntimeOrigins().some((origin) => sameOrigin(url, origin))
}

function isBotruntimeFileUploadUrl(url: string): boolean {
  if (!isBotruntimeOrigin(url)) return false
  try {
    return new URL(url).pathname === '/v1/files/upload'
  } catch {
    return false
  }
}

function botruntimeHeadersForUrl(url: string, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {}
  if (contentType) headers['content-type'] = contentType
  if (!isBotruntimeOrigin(url)) return headers
  const expectedEndpoint = contentType ? isBotruntimeFileUploadUrl(url) : false
  if (!expectedEndpoint) throw new Error('megaplan: Botruntime file URL uses an unexpected endpoint')
  const token = process.env.BP_TOKEN
  const botId = process.env.BP_BOT_ID
  if (!token || !botId) throw new Error('megaplan: missing Botruntime file-store credentials')
  headers.authorization = `Bearer ${token}`
  headers['x-bot-id'] = botId
  return headers
}

function botruntimeOrigins(): string[] {
  return [process.env.BP_API_URL, process.env.CLOUDAPI_PUBLIC_BASE_URL]
    .filter((value): value is string => Boolean(value))
}

function sameOrigin(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin
  } catch {
    return false
  }
}
