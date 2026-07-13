import type { IntegrationProps } from '../bp'
import { buildClient, run } from './shared'

export const createNegotiationTask: IntegrationProps['actions']['createNegotiationTask'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const material = await downloadApprovalMaterial(input.materialUrl)
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
    const fileUrl = await publishApprovedFile(
      input.taskId,
      decision.versionId ?? decision.fileId ?? 'actual',
      decision.fileName ?? 'approved.bin',
      file.bytes,
      file.contentType,
    )
    return { ...decision, fileUrl, fileSha256 }
  })

async function publishApprovedFile(
  taskId: string,
  versionId: string,
  fileName: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const base = process.env.BP_API_URL?.replace(/\/+$/, '')
  const token = process.env.BP_TOKEN
  const botId = process.env.BP_BOT_ID
  if (!base || !token || !botId) throw new Error('megaplan: missing Botruntime file-store environment')
  const key = `megaplan/approvals/${taskId}/${versionId}/${fileName.replace(/[^a-zA-Z0-9._-]+/g, '_')}`
  const headers = { authorization: `Bearer ${token}`, 'x-bot-id': botId, 'content-type': 'application/json' }
  const registered = await fetch(`${base}/v1/files`, {
    method: 'PUT', headers, body: JSON.stringify({ key, size: bytes.byteLength, contentType }),
  })
  if (!registered.ok) throw new Error(`megaplan: register approved file -> ${registered.status}`)
  const payload = (await registered.json()) as { file?: { uploadUrl?: string; url?: string } }
  if (!payload.file?.uploadUrl || !payload.file.url) throw new Error('megaplan: file store returned no upload/download URL')
  const uploaded = await fetch(payload.file.uploadUrl, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'x-bot-id': botId, 'content-type': contentType },
    body: bytes,
  })
  if (!uploaded.ok) throw new Error(`megaplan: upload approved file -> ${uploaded.status}`)
  return payload.file.url
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer as ArrayBuffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function downloadApprovalMaterial(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetch(url, { headers: botruntimeAuthHeaders(url) })
  if (!response.ok) throw new Error(`megaplan: download approval material -> ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error('megaplan: approval material is empty')
  return { bytes, contentType: response.headers.get('content-type') ?? 'application/octet-stream' }
}

function botruntimeAuthHeaders(url: string): Record<string, string> {
  const token = process.env.BP_TOKEN
  if (!token) return {}
  const bases = [process.env.BP_API_URL, process.env.CLOUDAPI_PUBLIC_BASE_URL]
  return bases.some((base) => sameOrigin(url, base)) ? { authorization: `Bearer ${token}` } : {}
}

function sameOrigin(url: string, base: string | undefined): boolean {
  if (!base) return false
  try {
    return new URL(url).origin === new URL(base).origin
  } catch {
    return false
  }
}
