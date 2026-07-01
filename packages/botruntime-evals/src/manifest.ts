import type { EvalDefinition } from './definition'

export const EVAL_MANIFEST_SCHEMA_VERSION = 1

export const EVAL_MANIFEST_TAGS = {
  source: 'adk' as const,
  type: 'eval-manifest' as const,
  schemaVersion: `${EVAL_MANIFEST_SCHEMA_VERSION}` as const,
}

export interface EvalManifest {
  schemaVersion: number
  evals: EvalDefinition[]
  chatWebhookId?: string
}
