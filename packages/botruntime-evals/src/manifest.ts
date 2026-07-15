import type { EvalDefinition } from './definition'

export const EVAL_MANIFEST_SCHEMA_VERSION = 1

export const EVAL_MANIFEST_TAGS = {
  source: 'adk' as const,
  type: 'eval-manifest' as const,
  schemaVersion: `${EVAL_MANIFEST_SCHEMA_VERSION}` as const,
}

export interface EvalManifest {
  schemaVersion: number
  /** Content-addressed identity used to bind a hosted run to exact definitions. */
  manifestId?: string
  evals: EvalDefinition[]
  chatWebhookId?: string
  /** Immutable fixture metadata only. File contents and signed URLs are never persisted here. */
  fixtures?: Record<string, EvalFixtureManifestEntry>
}

export interface EvalFixtureManifestEntry {
  fileId: string
  name: string
  contentType: string
  size: number
  sha256: string
}
