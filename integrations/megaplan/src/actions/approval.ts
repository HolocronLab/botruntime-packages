import type { IntegrationProps } from '../bp'
import { MAX_APPROVAL_FILE_BYTES, readBytesCapped } from '../megaplan-api'
import { buildClient, run } from './shared'

export const createNegotiationTask: IntegrationProps['actions']['createNegotiationTask'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const { file: storedMaterial } = await client.getFile({ id: input.materialFileId })
    const material = await downloadApprovalMaterial(storedMaterial.url)
    const actualSha256 = await sha256(material.bytes)
    if (actualSha256 !== input.materialSha256.toLowerCase()) {
      throw new Error(`megaplan: approval material SHA-256 mismatch`)
    }
    const materialFile = await api.uploadFile(input.materialName, material.bytes, material.contentType)
    const task = await api.createNegotiationTask({ ...input, materialFile })
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
    body: JSON.stringify({ key, size: bytes.byteLength, contentType, accessPolicies: ['integrations'] }),
  })
  if (!registered.ok) throw new Error(`megaplan: register approved file -> ${registered.status}`)
  const payload = (await registered.json()) as { file?: { id?: string; key?: string; uploadUrl?: string; url?: string } }
  if (!payload.file?.id || !payload.file.key || !payload.file.uploadUrl || !payload.file.url) {
    throw new Error('megaplan: file store returned no stable file reference or upload/download URL')
  }
  const uploaded = await fetch(payload.file.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: bytes,
  })
  if (!uploaded.ok) throw new Error(`megaplan: upload approved file -> ${uploaded.status}`)
  return { id: payload.file.id, key: payload.file.key, url: payload.file.url }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer as ArrayBuffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function downloadApprovalMaterial(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!isSafeHttpUrl(url)) {
    throw new Error('megaplan: Botruntime file did not resolve to a safe HTTP URL')
  }
  // The Files API resolves a stable file ID to a short-lived storage URL. It
  // may be cross-origin, so never forward Botruntime credentials to it.
  const response = await fetch(url)
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
