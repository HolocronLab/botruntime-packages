import { createHash } from 'node:crypto'
import type { EvalDefinition, EvalManifest } from '@holocronlab/botruntime-evals'
import { EVAL_MANIFEST_SCHEMA_VERSION } from '@holocronlab/botruntime-evals'
import type { Client } from '@holocronlab/botruntime-client'
import { fetchEvalManifestFile } from './eval-file-fetch'

type EvalManifestReference = {
  fileId?: string
  manifestId?: string
}

const manifestError = (
  code:
    'EVAL_MANIFEST_MISSING' | 'EVAL_MANIFEST_SCHEMA_INCOMPATIBLE' | 'EVAL_MANIFEST_HASH_MISMATCH',
  message: string,
): Error => new Error(`${code}: ${message}`)

const isNotFound = (error: unknown): boolean => {
  const value = error as {
    isApiError?: unknown
    code?: unknown
    type?: unknown
  }
  return value?.isApiError === true && (value.code === 404 || value.type === 'ResourceNotFound')
}

const contentManifestId = (manifest: EvalManifest): string => {
  const { manifestId: _manifestId, ...payload } = manifest
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`
}

export async function loadEvalManifest(
  client: Client,
  reference: EvalManifestReference = {},
): Promise<{
  evals: EvalDefinition[]
  fileId: string
  chatWebhookId: string | undefined
  fixtures: NonNullable<EvalManifest['fixtures']>
}> {
  let file: { id: string; url: string } | undefined
  if (reference.fileId) {
    try {
      file = (await client.getFile({ id: reference.fileId })).file
    } catch (error) {
      if (isNotFound(error)) {
        throw manifestError(
          'EVAL_MANIFEST_MISSING',
          'The exact synchronized eval manifest file no longer exists.',
        )
      }
      throw error
    }
  } else {
    // Compatibility for scheduled runs and workflows created by an older CLI.
    // New manual runs always carry an exact Files API id and do not use latest discovery.
    const { files } = await client.listFiles({
      tags: { source: 'adk', type: 'eval-manifest' },
    })
    file = files[0]
  }

  if (!file) {
    throw manifestError('EVAL_MANIFEST_MISSING', 'No synchronized eval manifest is available.')
  }

  const res = await fetchEvalManifestFile(file.url, client)
  if (!res.ok) {
    if (res.status === 404) {
      throw manifestError(
        'EVAL_MANIFEST_MISSING',
        'The synchronized eval manifest content is unavailable.',
      )
    }
    throw new Error(`Failed to fetch eval manifest: ${res.status}`)
  }

  let manifest: EvalManifest
  try {
    manifest = (await res.json()) as EvalManifest
  } catch {
    throw manifestError(
      'EVAL_MANIFEST_HASH_MISMATCH',
      'The eval manifest content is not valid JSON.',
    )
  }

  if (manifest.schemaVersion !== EVAL_MANIFEST_SCHEMA_VERSION) {
    throw manifestError(
      'EVAL_MANIFEST_SCHEMA_INCOMPATIBLE',
      `Schema version ${manifest.schemaVersion} is not supported (expected ${EVAL_MANIFEST_SCHEMA_VERSION}). Update the runtime and run \`brt eval\` again.`,
    )
  }

  const computedManifestId = contentManifestId(manifest)
  const expectedManifestId = reference.manifestId ?? manifest.manifestId
  if (
    !expectedManifestId ||
    manifest.manifestId !== expectedManifestId ||
    computedManifestId !== expectedManifestId
  ) {
    throw manifestError(
      'EVAL_MANIFEST_HASH_MISMATCH',
      'The synchronized eval manifest does not match its content identity.',
    )
  }

  return {
    evals: manifest.evals,
    fileId: expectedManifestId,
    chatWebhookId: manifest.chatWebhookId,
    fixtures: manifest.fixtures ?? {},
  }
}
