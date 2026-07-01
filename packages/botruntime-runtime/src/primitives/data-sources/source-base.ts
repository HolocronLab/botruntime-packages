import { BaseWorkflow, Typings } from '../workflow'
import { z } from '@holocronlab/botruntime-sdk'
import { adk } from '../../library'
import { ZodType } from '@holocronlab/botruntime-zui'
import { WellKnownTags } from '../../constants'

export type Item = z.infer<typeof Item>
const Item = z.object({
  file: z.string(),
  name: z.string(),
  hash: z.string(),
  size: z.number(),
})

export type SyncInput = z.infer<typeof SyncInput>
export const SyncInput = z.object({
  dsId: z.string(),
  kbName: z.string(),
  kbId: z.string(),
  force: z.boolean().optional().describe("Force re-indexing even if files haven't changed").default(false),
})

export type SyncOutput = z.infer<typeof SyncOutput>
export const SyncOutput = z.object({
  processed: z.number().default(0),
  added: z.array(Item).default([]),
  updated: z.array(Item).default([]),
  deleted: z.array(Item).default([]),
  errors: z.array(z.string()).default([]),
})

export const createSyncWorkflow = <TState extends ZodType = ZodType>(props: {
  type: string
  state: TState
  handler: (
    props: Typings.HandlerProps<`data_source_sync_${string}`, typeof SyncInput, typeof SyncOutput, TState>
  ) => Promise<z.infer<typeof SyncOutput>>
}) =>
  new BaseWorkflow({
    name: `data_source_sync_${props.type}`,
    input: SyncInput,
    output: SyncOutput,
    state: props.state,
    timeout: '120m',
    async handler(execProps) {
      const { kbName, kbId, dsId } = execProps.input

      // Find the correct source instance from the project
      const kb = adk.project.knowledge.find((kb) => kb.name === kbName)
      if (!kb) {
        throw new Error(`Knowledge base '${kbName}' not found`)
      }

      const source = kb.sources.find((s) => s.id === dsId)
      if (!source) {
        throw new Error(`Data source with ID '${dsId}' not found in knowledge base '${kbName}'`)
      }

      console.log(
        `🔄 Starting sync for data source '${dsId}' of type '${source.type}' in knowledge base '${kbName}' (${kbId})`
      )

      // Bind the handler to the correct source instance so `this` works inside it
      return await props.handler.bind(source)(execProps)
    },
  })

/**
 * The base set of well-known tags every ingested file carries, identifying
 * the knowledge base and the source it came from. Source implementations merge
 * these with any user-supplied `extraFileTags`.
 */
export type BaseFileTags = {
  [WellKnownTags.knowledge.KNOWLEDGE]: 'knowledge-base'
  [WellKnownTags.knowledge.KNOWLEDGE_BASE_ID]: string
  [WellKnownTags.knowledge.KNOWLEDGE_BASE_NAME]: string
  [WellKnownTags.knowledge.KNOWLEDGE_SOURCE_ID]: string
  [WellKnownTags.knowledge.KNOWLEDGE_SOURCE_TYPE]: string
}

/**
 * Arbitrary extra file tags. Either a static record applied to every file, or
 * a function invoked per upload (so callers can derive tags from runtime
 * context, e.g. the current draft/published slot). Reserved well-known tag
 * keys (`source`, `kbId`, `kbName`, `dsId`, `dsType`) are stripped so custom
 * tags can never clobber the identity tags that scope KB search.
 */
export type ExtraFileTags = Record<string, string> | (() => Record<string, string>)

const RESERVED_TAG_KEYS = new Set<string>(Object.values(WellKnownTags.knowledge))

export abstract class DataSource {
  public readonly id: string
  public readonly type: string
  protected readonly extraTags: ExtraFileTags | undefined

  /**
   * The workflow that handles synchronization for this data source
   * Each data source type provides its own sync workflow implementation
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic workflow type
  public abstract readonly syncWorkflow: BaseWorkflow<any>

  /**
   * Get the serializable configuration for this data source.
   * Used for computing config hashes to detect changes.
   */
  public abstract getConfig(): Record<string, unknown>

  constructor(id: string, type: string, options?: { tags?: ExtraFileTags | undefined }) {
    this.id = id
    this.type = type
    this.extraTags = options?.tags
  }

  // ---------------------------------------------------------------------------
  // Extension hooks
  //
  // Built-in sources call these while building each uploaded file's tags.
  // Pass `tags` to a factory for the common case, or override `extraFileTags()`
  // in a subclass for full control. Defaults preserve the original behavior, so
  // overriding / passing tags is purely additive.
  // ---------------------------------------------------------------------------

  /**
   * Extra tags merged into every uploaded file. Defaults to the `tags` option
   * passed to the factory (resolving a function form per call). Subclasses may
   * override for fully dynamic behavior.
   *
   * @example
   * // via factory option (no subclass needed)
   * DataSource.Website.fromUrls(urls, { tags: { slot: 'draft' } })
   * @example
   * // dynamic, derived from runtime context
   * DataSource.Website.fromUrls(urls, { tags: () => ({ slot: currentSlot() }) })
   */
  protected extraFileTags(): Record<string, string> {
    if (!this.extraTags) return {}
    return typeof this.extraTags === 'function' ? this.extraTags() : this.extraTags
  }

  /**
   * The stable ownership tags for this source. Use these when listing existing
   * files, so cleanup still sees files written under older custom tag values.
   */
  protected baseFileTags(input: z.infer<typeof SyncInput>): BaseFileTags {
    return {
      [WellKnownTags.knowledge.KNOWLEDGE]: 'knowledge-base',
      [WellKnownTags.knowledge.KNOWLEDGE_BASE_ID]: input.kbId,
      [WellKnownTags.knowledge.KNOWLEDGE_BASE_NAME]: input.kbName,
      [WellKnownTags.knowledge.KNOWLEDGE_SOURCE_ID]: this.id,
      [WellKnownTags.knowledge.KNOWLEDGE_SOURCE_TYPE]: this.type,
    }
  }

  /**
   * The full tag object applied to each uploaded file: the well-known identity
   * tags plus any user-supplied extra tags. Reserved keys in the extra tags are
   * dropped so they can't override KB/source identity. Source implementations
   * call this instead of assembling tags inline.
   */
  protected fileTags(input: z.infer<typeof SyncInput>): BaseFileTags & Record<string, string> {
    const base = this.baseFileTags(input)
    const extra: Record<string, string> = {}
    for (const [key, value] of Object.entries(this.extraFileTags())) {
      if (RESERVED_TAG_KEYS.has(key)) {
        console.warn(`Ignoring reserved tag key "${key}" in extra tags for data source "${this.id}"`)
        continue
      }
      extra[key] = value
    }
    return { ...base, ...extra }
  }

  protected fileTagsMatch(
    file: { tags?: Record<string, string> | undefined } | null | undefined,
    expected: Record<string, string>
  ): boolean {
    if (!file?.tags) return false

    const actualKeys = Object.keys(file.tags)
    const expectedKeys = Object.keys(expected)
    return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => file.tags?.[key] === expected[key])
  }

  protected fileTagsPatch(
    file: { tags?: Record<string, string> | undefined } | null | undefined,
    expected: Record<string, string>
  ): Record<string, string | null> {
    const patch: Record<string, string | null> = { ...expected }
    for (const key of Object.keys(file?.tags ?? {})) {
      if (!(key in expected)) {
        patch[key] = null
      }
    }
    return patch
  }
}
