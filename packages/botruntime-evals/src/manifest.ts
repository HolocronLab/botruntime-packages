import type { EvalDefinition } from './definition'

// v2 adds durable table fixtures/assertions. Older runners must reject these
// manifests instead of silently skipping platform-owned setup.
export const EVAL_MANIFEST_SCHEMA_VERSION = 2

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
