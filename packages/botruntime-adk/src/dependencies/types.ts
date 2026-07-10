import { z } from '@holocronlab/botruntime-sdk'
import type { StatusVerdict } from '@holocronlab/botruntime-runtime'

export type Environment = 'dev' | 'prod'
export type ResourceType = 'integration' | 'plugin' | 'interface'

export const integrationDependencyEntrySchema = z.object({
  name: z.string(),
  version: z.string(),
  enabled: z.boolean(),
  config: z.record(z.any()).default({}),
  /**
   * Active configuration variant (`configurations[type]`), echoed from Cloud's
   * `getBot` response (WS0). Absent for the default configuration. Lets the
   * status resolver validate against the right variant schema without a cloud
   * roundtrip.
   */
  configurationType: z.string().optional(),
  /**
   * Cloud's install-time verdict of which required fields were still missing
   * when the integration was last installed/enabled (WS0). Persisted only while
   * the integration stays disabled with unchanged config; the offline status
   * resolver reads it as authoritative (Cloud's actual validation beats the
   * catalog spec, and enumerates fields a client-side schema check can't — e.g.
   * OAuth/identifier credentials). A live (online) build trusts the current
   * cloud state over this snapshot instead.
   *
   * Both fields are additive-optional: old legacy locks omit them and still validate
   * against `version: 1` — no schema bump, no migration.
   */
  missingFields: z.array(z.string()).optional(),
  /**
   * Last-known authorization state of an OAuth/connection-gated integration
   * (WS5/#7): set on every cloud refresh when the spec gates on an identifier
   * the cloud bot doesn't have yet; cleared the moment the identifier appears
   * (the user completed the connect flow). Lets the offline surfaces
   * (offline readiness and the deploy gate) report the same
   * `unconfigured` verdict the codegen carrier bakes into the runtime, instead
   * of mapping enabled ⟹ available. Additive-optional like the fields above.
   */
  authorizationPending: z.boolean().optional(),
})
export type IntegrationDependencyEntry = z.infer<typeof integrationDependencyEntrySchema>

export const pluginDependencyMappingSchema = z.object({
  integrationAlias: z.string(),
})
export type PluginDependencyMapping = z.infer<typeof pluginDependencyMappingSchema>

export const pluginDependencyEntrySchema = z.object({
  name: z.string(),
  version: z.string(),
  enabled: z.boolean().default(true),
  config: z.record(z.any()).default({}),
  dependencies: z.record(pluginDependencyMappingSchema).default({}),
  /**
   * Cloud's install-time verdict of which required fields were still missing when
   * the plugin was last installed/enabled (WS0/WS5) — the plugin counterpart of the
   * integration field above, with the same lifecycle: persisted only while the
   * plugin stays disabled with unchanged config, read as authoritative by the
   * offline status resolver, additive-optional (old legacy locks validate unchanged).
   */
  missingFields: z.array(z.string()).optional(),
})
export type PluginDependencyEntry = z.infer<typeof pluginDependencyEntrySchema>

export const integrationSnapshotEntrySchema = integrationDependencyEntrySchema.extend({
  cloudAlias: z.string().optional(),
  cloudId: z.string().optional(),
  updatedAt: z.string().optional(),
  configurationRevision: z.string().optional(),
})
export type IntegrationSnapshotEntry = z.infer<typeof integrationSnapshotEntrySchema>

export const pluginSnapshotEntrySchema = pluginDependencyEntrySchema.extend({
  cloudAlias: z.string().optional(),
  cloudId: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type PluginSnapshotEntry = z.infer<typeof pluginSnapshotEntrySchema>

export const dependencyStateSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  env: z.enum(['dev', 'prod']),
  integrations: z.record(integrationDependencyEntrySchema).default({}),
  plugins: z.record(pluginDependencyEntrySchema).default({}),
})
export type DependencyStateData = z.infer<typeof dependencyStateSchema>

export const dependencyTargetScopeSchema = z
  .object({
  apiUrl: z
    .string()
    .min(1)
    .refine((value) => value === value.trim() && !value.endsWith('/'), {
      message: 'apiUrl must be canonical (non-empty, trimmed, without trailing slash)',
    }),
  workspaceId: z
    .string()
    .min(1)
    .refine((value) => value === value.trim(), { message: 'workspaceId must be a non-empty exact string' }),
    botId: z
      .string()
      .min(1)
      .refine((value) => value === value.trim(), { message: 'botId must be a non-empty exact string' }),
  })
  .strict()
export type DependencyTargetScope = z.infer<typeof dependencyTargetScopeSchema>

export const dependencySnapshotTargetSchema = dependencyTargetScopeSchema
  .extend({ env: z.enum(['dev', 'prod']) })
  .strict()
export type DependencySnapshotTarget = z.infer<typeof dependencySnapshotTargetSchema>

export const dependencySnapshotSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(2),
  env: z.enum(['dev', 'prod']),
  target: dependencyTargetScopeSchema,
  fetchedAt: z.string(),
  botUpdatedAt: z.string().optional(),
  stale: z.boolean().optional(),
  integrations: z.record(integrationSnapshotEntrySchema).default({}),
  plugins: z.record(pluginSnapshotEntrySchema).default({}),
})
export type DependencySnapshotData = z.infer<typeof dependencySnapshotSchema>

const dependencyMigrationDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const dependencyMigrationAliasListSchema = z
  .array(z.string().min(1))
  .refine((aliases) => aliases.every((alias, index) => index === 0 || aliases[index - 1]! < alias), {
    message: 'migration aliases must be unique and sorted',
  })

export const dependencyMigrationProgressSchema = z
  .object({
    integrations: dependencyMigrationAliasListSchema,
    plugins: dependencyMigrationAliasListSchema,
  })
  .strict()
export type DependencyMigrationProgress = z.infer<typeof dependencyMigrationProgressSchema>

export const dependencyMigrationSourceSchema = z
  .object({
    kind: z.enum(['agentConfig', 'lock']),
    digest: dependencyMigrationDigestSchema,
  })
  .strict()
export type DependencyMigrationSource = z.infer<typeof dependencyMigrationSourceSchema>

const dependencyMigrationSourcesSchema = z
  .array(dependencyMigrationSourceSchema)
  .min(1)
  .refine(
    (sources) => sources.every((source, index) => index === 0 || sources[index - 1]!.kind < source.kind),
    { message: 'migration sources must be unique and sorted by kind' }
  )

export const dependencyMigrationPlanSchema = z
  .object({
    digest: dependencyMigrationDigestSchema,
    integrations: dependencyMigrationAliasListSchema,
    plugins: dependencyMigrationAliasListSchema,
  })
  .strict()
export type DependencyMigrationPlan = z.infer<typeof dependencyMigrationPlanSchema>

export const dependencyMigrationPendingSchema = z
  .object({
    version: z.literal(2),
    target: dependencySnapshotTargetSchema,
    sources: dependencyMigrationSourcesSchema,
    plan: dependencyMigrationPlanSchema,
    completed: dependencyMigrationProgressSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (pending) =>
      pending.completed.integrations.every((alias) => pending.plan.integrations.includes(alias)) &&
      pending.completed.plugins.every((alias) => pending.plan.plugins.includes(alias)),
    { message: 'completed migration aliases must be a subset of the immutable plan' }
  )
export type DependencyMigrationPending = z.infer<typeof dependencyMigrationPendingSchema>

const dependencyMigrationProvenanceSchema = z.union([
  z.object({ kind: z.literal('cloud') }).strict(),
  z
    .object({
      kind: z.literal('legacy'),
      sources: dependencyMigrationSourcesSchema,
      planDigest: dependencyMigrationDigestSchema,
    })
    .strict(),
])

export const dependencyMigrationCompletionRecordSchema = z
  .object({
    target: dependencySnapshotTargetSchema,
    runtimeBotId: z
      .string()
      .min(1)
      .refine((value) => value === value.trim(), { message: 'runtimeBotId must be a non-empty exact string' })
      .optional(),
    provenance: dependencyMigrationProvenanceSchema,
    plan: dependencyMigrationProgressSchema,
    completed: dependencyMigrationProgressSchema,
    completedAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (record) =>
      record.completed.integrations.length === record.plan.integrations.length &&
      record.completed.plugins.length === record.plan.plugins.length &&
      record.completed.integrations.every((alias, index) => alias === record.plan.integrations[index]) &&
      record.completed.plugins.every((alias, index) => alias === record.plan.plugins[index]),
    { message: 'a migration completion record must complete its entire plan' }
  )
  .refine((record) => record.runtimeBotId === undefined || record.target.env === 'dev', {
    message: 'runtimeBotId evidence is valid only for a dev migration completion',
  })
export type DependencyMigrationCompletionRecord = z.infer<typeof dependencyMigrationCompletionRecordSchema>

export const dependencyMigrationMarkerSchema = z
  .object({
    version: z.literal(2),
    records: z
      .object({
        dev: dependencyMigrationCompletionRecordSchema.optional(),
        prod: dependencyMigrationCompletionRecordSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (marker) =>
      (!marker.records.dev || marker.records.dev.target.env === 'dev') &&
      (!marker.records.prod || marker.records.prod.target.env === 'prod'),
    { message: 'migration record key must match target.env' }
  )
export type DependencyMigrationMarker = z.infer<typeof dependencyMigrationMarkerSchema>

/**
 * A dependency's capability state plus its identity — the flat record surfaced
 * by offline readiness resolution, the deploy plan, and runtime generation.
 * Embeds the same {@link StatusVerdict} the runtime carrier uses so the build,
 * CLI, and runtime surfaces cannot disagree. Field names are a public contract.
 */
export interface DependencyStatus extends StatusVerdict {
  type: ResourceType
  alias: string
  name: string
  version: string
  enabled: boolean
}

export interface AddSpec {
  name: string
  version?: string
  alias?: string
  config?: Record<string, unknown>
  dependencies?: Record<string, PluginDependencyMapping>
}

export interface ConfigPatch {
  set?: Record<string, unknown>
  unset?: string[]
  map?: Record<string, PluginDependencyMapping>
}

export interface MutationResult {
  ok: boolean
  noop?: boolean
  resource?: { type: ResourceType; alias: string; name: string; version: string }
  stateChange?: { before: unknown; after: unknown }
  /** Populated when installing a plugin with auto-resolved interface dependencies. */
  autoResolved?: Array<{ pluginInterfaceAlias: string; integrationAlias: string }>
  /**
   * Set when a dependency (integration or plugin) was installed but left disabled
   * because Cloud rejected the enable due to missing required configuration.
   * Mirrors the Integration Hub UI behavior.
   */
  installedDisabled?: { missingFields: string[] }
  /**
   * Set when an OAuth/connection-gated integration was installed disabled because
   * the user hasn't completed the connect flow yet (WS5/#7). The snapshot entry
   * carries `authorizationPending: true` until the cloud bot gains an identifier.
   */
  installedAwaitingAuthorization?: boolean
}

export interface DiffResult {
  target: Environment
  snapshotReflectsCloud: boolean
  delta: {
    addedInSnapshot: Array<{ type: ResourceType; alias: string; name: string; version: string }>
    removedInSnapshot: Array<{ type: ResourceType; alias: string; name: string; version: string }>
    changedInSnapshot: Array<{ type: ResourceType; alias: string; field: string }>
  }
}

export interface ApplyAction {
  type: ResourceType
  alias: string
  action: 'install' | 'upgrade' | 'downgrade' | 'reconfigure' | 'enable' | 'disable' | 'uninstall'
  details?: Record<string, unknown>
}

export interface ApplyResult {
  target: Environment
  applied: ApplyAction[]
  skipped: ApplyAction[]
  errors: Array<{ action: ApplyAction; code: string; message: string; suggestion?: string }>
  dryRun: boolean
}

export interface MigrationResult {
  migrated: Environment[]
  warnings: Array<{ code: string; message: string }>
  skipped: Array<{ env: Environment; reason: string }>
  legacySources?: Array<'lock' | 'agentConfig'>
  snapshotWrites?: Environment[]
  cloudWrites?: Environment[]
}
