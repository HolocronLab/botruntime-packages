import type { IntegrationProps } from '../bp'
import { MAX_APPROVAL_FILE_BYTES, readBytesCapped } from '../megaplan-api'
import { buildClient, run } from './shared'

export const createNegotiationTask: IntegrationProps['actions']['createNegotiationTask'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const operationMarker = await approvalOperationMarker(input)
    const existing = await api.findNegotiationTask(operationMarker)
    if (existing) {
      return { taskId: existing.id, itemId: undefined, versionId: undefined }
    }
    let materialUrl: string
    if (input.materialFileId) {
      const { file: storedMaterial } = await client.getFile({ id: input.materialFileId })
      materialUrl = storedMaterial.url
    } else if (input.materialUrl && isBotruntimeUrl(input.materialUrl)) {
      // Compatibility with the canonical lawyer bot that persisted the Files
      // download URL before stable file IDs were introduced. Restrict this
      // legacy input to our own origins so it cannot become an SSRF primitive.
      materialUrl = input.materialUrl
    } else {
      throw new Error('megaplan: approval material requires a stable file ID or Botruntime URL')
    }
    const material = await downloadApprovalMaterial(materialUrl)
    const actualSha256 = await sha256(material.bytes)
    if (actualSha256 !== input.materialSha256.toLowerCase()) {
      throw new Error(`megaplan: approval material SHA-256 mismatch`)
    }
    const materialFile = await api.uploadFile(input.materialName, material.bytes, material.contentType)
    const task = await api.createNegotiationTask({
      ...input,
      name: `${input.name} [${operationMarker}]`,
      statement: [input.statement, `Botforge operation: ${operationMarker}`].filter(Boolean).join('\n\n'),
      materialFile,
    })
    const item = task.negotiationItems?.[0]
    return { taskId: task.id, itemId: item?.id, versionId: item?.actualVersion?.id }
  })

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

async function approvalOperationMarker(input: {
  name: string
  responsibleId: string
  approverIds: string[]
  dealIds: string[]
  materialName: string
  materialSha256: string
  statement?: string
}): Promise<string> {
  const canonical = JSON.stringify({
    name: input.name,
    responsibleId: input.responsibleId,
    approverIds: [...input.approverIds].sort(),
    dealIds: [...input.dealIds].sort(),
    materialName: input.materialName,
    materialSha256: input.materialSha256.toLowerCase(),
    statement: input.statement ?? '',
  })
  const digest = await sha256(new TextEncoder().encode(canonical))
  return `BF-${digest.slice(0, 20)}`
}

async function downloadApprovalMaterial(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!isSafeHttpUrl(url)) {
    throw new Error('megaplan: Botruntime file did not resolve to a safe HTTP URL')
  }
  // The Files API can return either a same-origin, auth-gated URL (Botforge)
  // or a cross-origin presigned storage URL. Credentials only go to a known
  // Botruntime origin.
  const response = await fetch(url, { headers: botruntimeHeadersForUrl(url) })
  if (!response.ok) throw new Error(`megaplan: download approval material -> ${response.status}`)
  const bytes = await readBytesCapped(response, MAX_APPROVAL_FILE_BYTES)
  if (bytes.byteLength === 0) throw new Error('megaplan: approval material is empty')
  return { bytes, contentType: response.headers.get('content-type') ?? 'application/octet-stream' }
}

function isSafeHttpUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function isBotruntimeUrl(url: string): boolean {
  return botruntimeOrigins().some((origin) => sameOrigin(url, origin))
}

function botruntimeHeadersForUrl(url: string, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {}
  if (contentType) headers['content-type'] = contentType
  if (!isBotruntimeUrl(url)) return headers
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
