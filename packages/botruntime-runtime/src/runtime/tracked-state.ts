import { Client } from '@holocronlab/botruntime-client'
import { z } from '@holocronlab/botruntime-sdk'
import { FileId } from '@holocronlab/botruntime-const'
import axios from 'axios'
import bytes from 'bytes'
import { createHash } from 'crypto'
import sizeof from 'object-sizeof'
import prettyBytes from 'pretty-bytes'
import { span } from '../telemetry/tracing'
import { ZuiType } from '../types'
import { isStateTooBig, MaxStateSize } from '../utilities/size'
import { context, getActiveConversationId } from './context/context'
import { LifecycleStateSchema } from './events'
import { importScheduledHeavyImports } from './heavy-imports'
import { deserializeStateReferences, serializeStateReferences } from './state-references'
import { TrackedStateSchema } from './tracked-state-schema'

const EMPTY_STATE = <TrackedStateValue>{
  value: undefined,
  location: { type: 'state' },
}

// Maximum size for state swapping - 100MB
const MAX_SWAP_FILE_SIZE = bytes.parse('100MB')!

/**
 * State name constants that must match the names defined in bot.definition.ts
 *
 * These constants ensure consistency between runtime state names and
 * the state definitions in the generated bot.definition.ts file.
 */
export const BUILT_IN_STATES = {
  /** Generic conversation-specific state (user-defined per conversation) */
  conversation: 'state',
  /** User-specific state (persists across conversations per user) */
  user: 'userState',
  /** Bot-wide global state (persists across all conversations) */
  bot: 'botState',
  /** Workflow-specific state (persists across workflow executions) */
  workflowState: 'workflowState',
  /** Workflow cached steps executions */
  workflowSteps: 'workflowSteps',
  /** Data source metadata for dashboard visibility */
  dsData: 'dsData',
  /** Lifecycle session state (nudge/expiration tracking, survives user state resets) */
  lifecycle: 'lifecycleState',
} as const

export class TrackedState<Schema extends ZuiType = ZuiType> {
  type: 'conversation' | 'user' | 'bot' | 'workflow'
  id: string
  name: string
  state: Schema
  client: Client
  value!: Schema extends ZuiType ? z.output<Schema> | undefined : never | undefined

  private _lastSavedHash: string | null = null
  private _lastSavedValue: unknown = undefined
  private _isDirty: boolean = false
  private _loaded: boolean = false

  private _saving: boolean = false
  private _saveAgain: boolean = false
  private _saveAgainCount: number = 0

  private static _saveChain: Promise<void> = Promise.resolve()

  private constructor(props: {
    type: 'conversation' | 'user' | 'bot' | 'workflow'
    id: string
    schema: Schema
    client: Client
    name: string
  }) {
    this.state = props.schema
    this.client = props.client
    this.type = props.type
    this.id = props.id
    this.name = props.name || 'state'
  }

  public static create<T extends ZuiType>(props: {
    type: 'conversation' | 'user' | 'bot' | 'workflow'
    id: string
    schema: T
    client: Client
    name: string
  }): TrackedState<T> {
    const states = context.get('states', { optional: true })
    const executionFinished = context.get('executionFinished', { optional: true })

    if (executionFinished) {
      throw new Error(
        `Cannot create new TrackedState "${props.type}/${props.id}/${
          props.name || 'state'
        }" after execution has finished.`
      )
    }

    const match = states?.find((x) => x.id === props.id && x.type === props.type && x.name === (props.name || 'state'))

    if (match) {
      return match as TrackedState<T>
    }

    const instance = new TrackedState<T>(props)
    states?.push(instance)

    return instance
  }

  public static async saveAllDirty(opts?: { throwOnError?: boolean }): Promise<void> {
    // Serialize concurrent saves through a chain so every caller runs (and awaits)
    // its own save pass. A naive "skip if already saving" guard would let a caller
    // arriving mid-flight return immediately without ever observing whether its
    // states persisted, silently dropping the `throwOnError` guarantee.
    const run = this._saveChain.then(
      () => this._saveAllDirtyOnce(opts),
      () => this._saveAllDirtyOnce(opts)
    )
    // Keep the chain alive regardless of this run's outcome, so one caller's
    // rejection doesn't poison the next caller's save.
    this._saveChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private static async _saveAllDirtyOnce(opts?: { throwOnError?: boolean }): Promise<void> {
    const states = context.get('states', { optional: true })
    const dirtyStates = states?.filter((s) => s.isDirty()) || []
    if (!dirtyStates.length) {
      return
    }
    const conversationId = getActiveConversationId()

    const results = await span(
      'state.saveAllDirty',
      {
        states_count: states?.length || 0,
        states: states.map((s) => `${s.type}/${s.id}/${s.name}`),
        ...(conversationId ? { conversationId } : {}),
      },
      () => Promise.allSettled(dirtyStates.map((s) => s.save()))
    )

    if (opts?.throwOnError) {
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((f) => f.reason),
          `Failed to persist ${failures.length} of ${dirtyStates.length} state(s)`
        )
      }
    }
  }

  public static async loadAll() {
    await span('state.loadAll', {}, async () => {
      const client = context.get('client')._inner as unknown as Client
      const botId = context.get('botId', { optional: true })
      const user = context.get('user', { optional: true })
      const conversation = context.get('conversation', { optional: true })

      const { adk } = await import('./adk')

      if (botId) {
        TrackedState.create({
          client,
          name: BUILT_IN_STATES.bot,
          type: 'bot',
          id: botId,
          schema: adk.project.config.bot?.state || z.object({}),
        })
      }

      if (user) {
        TrackedState.create({
          client,
          name: BUILT_IN_STATES.user,
          type: 'user',
          id: user.id,
          schema: adk.project.config.user?.state || z.object({}),
        })
      }

      if (conversation) {
        // Find the conversation definition to get its state schema
        // Construct the full handler name (integration.channel) to match against definitions
        const handlerName = conversation.integration + '.' + conversation.channel
        const definition = adk.project.conversations.find((c) => {
          const def = c.getDefinition()
          if (typeof def.channel === 'string') {
            return def.channel === handlerName || def.channel === '*'
          } else if (Array.isArray(def.channel)) {
            return def.channel.includes(handlerName)
          }
          return false
        })

        TrackedState.create({
          client,
          name: BUILT_IN_STATES.conversation,
          type: 'conversation',
          id: conversation.id,
          schema: definition?.schema || z.object({}),
        })

        // Create __lifecycle state if the conversation has lifecycle configured
        if (definition?.lifecycleConfig) {
          TrackedState.create({
            client,
            name: BUILT_IN_STATES.lifecycle,
            type: 'conversation',
            id: conversation.id,
            schema: LifecycleStateSchema,
          })
        }
      }

      const states = context.get('states', { optional: true })

      const promises = Promise.allSettled(states?.map((state) => state.load()) ?? [])

      // During state loading we piggy back on network i/o to import any heavy imports
      void importScheduledHeavyImports()

      await promises
    })
  }

  public static unloadAll() {
    context.get('states', { optional: true })?.splice(0)
  }

  public async load(force: boolean = false) {
    if (this._loaded && !force) {
      return
    }

    await span(
      'state.load',
      {
        type: this.type,
        name: this.name,
      },
      async (s) => {
        const { location, value } = await this.client
          .getOrSetState({
            type: this.type,
            name: this.name,
            id: this.id,
            payload: { ...EMPTY_STATE },
          })
          .then((x) => parseState(x.state.payload))

        s.setAttribute('has_value', value !== undefined)
        s.setAttribute('location', location.type)

        if (location.type === 'file') {
          try {
            const { file } = await this.client.getFile({
              id: location.key as FileId,
            })
            const { data } = await axios.get(file.url)
            this.value = typeof data === 'string' ? JSON.parse(data) : data
          } catch (err) {
            console.error(`Failed to load swapped state from file: ${err instanceof Error ? err.message : String(err)}`)
            this.value = undefined as typeof this.value
          }
        } else {
          this.value = value
        }

        // Apply schema default if value is null/undefined
        // Track if we're applying defaults (only mark dirty if state was truly empty from API)
        const needsDefaults = this.value == null || this.value === undefined

        if (needsDefaults) {
          this.value = this._schemaDefault()
          this._isDirty = true // Mark as dirty to save the default
        }

        // Deserialize any state references (load workflow instances, etc.)
        await deserializeStateReferences(this.value)

        // Validate that the loaded value can be serialized
        try {
          // Calculate initial hash after loading
          const serialized = serializeStateReferences(this.value)
          this._lastSavedHash = this.calculateHash(this.value)
          const tooBigOnLoad = isStateTooBig(serialized)
          this._lastSavedValue = tooBigOnLoad ? undefined : JSON.parse(JSON.stringify(serialized))
          this._loaded = true
          if (!tooBigOnLoad) {
            s.setAttribute('state.value', serialized)
          }
          // Don't override _isDirty if we just set it to true for defaults
          if (!this._isDirty) {
            this._isDirty = false
          }
        } catch {
          // If we can't calculate hash due to circular references, the state is invalid
          this.value = undefined as typeof this.value
          this._lastSavedHash = null
          this._isDirty = false
          this._loaded = true
          throw new Error(
            `Loaded state contains circular references and cannot be used. ` + `The state has been reset to undefined.`
          )
        }
      }
    )
  }

  public async save() {
    if (this._saving) {
      this._saveAgain = true
      return
    }

    const executionFinished = context.get('executionFinished', { optional: true })

    if (executionFinished) {
      throw new Error(
        `Cannot save TrackedState "${this.type}/${this.id}/${this.name || 'state'}" after execution has finished.`
      )
    }

    try {
      const conversationId = getActiveConversationId()
      await span(
        'state.save',
        {
          type: this.type,
          name: this.name,
          ...(conversationId ? { conversationId } : {}),
        },
        async (s) => {
          // Never persist an `undefined`/`null` state value. A workflow instance
          // whose value is undefined (e.g. a reference loaded but not yet
          // hydrated) would otherwise serialize to `undefined`, and the snapshot
          // line below (`JSON.parse(JSON.stringify(valueToSave))`) would throw
          // `"undefined" is not valid JSON` — failing the save. Worse, on the
          // next `workflow_callback` the instance fails to load and the runtime
          // silently degrades the event to a plain `event`, so completion
          // handlers never fire. Coerce to the schema default (mirroring the
          // load path's `needsDefaults` handling) so the record is always valid.
          if (this.value == null) {
            this.value = this._schemaDefault()
          }

          // Convert any state-referenceable objects to refs for serialization
          const valueToSave = serializeStateReferences(this.value)

          // Check if the object can be serialized (no circular references)
          try {
            JSON.stringify(valueToSave)
          } catch {
            throw new Error(
              `State contains circular references and cannot be saved. ` +
                `Objects with circular references are not supported in state storage. ` +
                `Consider restructuring your data to avoid circular references.`
            )
          }

          const changedKeys = this._computeChangedKeys(valueToSave)

          const stateSize = sizeof(valueToSave)
          s.setAttribute('state_size_bytes', stateSize)

          // Check absolute maximum size
          if (stateSize > MAX_SWAP_FILE_SIZE) {
            throw new Error(
              `State size (${prettyBytes(stateSize)}) exceeds maximum allowed size of ${prettyBytes(MAX_SWAP_FILE_SIZE)}. ` +
                `Consider using Tables API for long-term storage of large data.`
            )
          }

          const tooBig = isStateTooBig(valueToSave)

          let payload: TrackedStateValue

          if (!tooBig) {
            payload = {
              value: valueToSave,
              location: { type: 'state' },
            }
          } else {
            try {
              const key = `swap/${this.type}/${this.id}/state.json`
              const { file } = await this.client.uploadFile({
                key,
                index: false,
                contentType: 'application/json',
                content: JSON.stringify(valueToSave),
                accessPolicies: [],
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                tags: {
                  system: 'true',
                  purpose: 'swap',
                },
              })

              console.warn(
                `State for ${this.type}/${this.id} is too big (${tooBig.human}) for State API (max ${MaxStateSize.human}). ` +
                  `Swapping state to file ${file.id}. Swap states are valid for 30 days.`
              )

              s.setAttribute('swapped_to_file', tooBig ? true : false)

              payload = {
                value: undefined,
                location: { type: 'file', key: file.id },
              }
            } catch (err) {
              s.setAttribute('swapped_to_file', false)
              s.addEvent('swap_failed', {
                error: err instanceof Error ? err.message : String(err),
                size_bytes: stateSize,
              })

              console.error(`Failed to swap state: ${err instanceof Error ? err.message : String(err)}`)
              // Fallback to saving directly (might fail with size limit)
              payload = {
                value: valueToSave,
                location: { type: 'state' },
              }
            }
          }

          await this.client.setState({
            type: this.type,
            name: this.name,
            id: this.id,
            payload,
          })

          // Set span attributes after successful save (skip value for swapped states to avoid bloating spans)
          const savedInline = payload.location.type === 'state'
          if (savedInline) {
            s.setAttribute('state.value', valueToSave)
            if (this._lastSavedValue !== undefined) {
              s.setAttribute('state.previous_value', this._lastSavedValue)
            }
          }
          if (changedKeys.length > 0) {
            s.setAttribute('state.changed_keys', changedKeys)
          }

          // Update hash and snapshot after successful save
          this._lastSavedHash = this.calculateHash(this.value)
          if (savedInline) {
            // Defensive: `JSON.stringify(undefined)` returns the JS value
            // `undefined`, and `JSON.parse(undefined)` coerces to
            // `JSON.parse("undefined")` which throws. The `this.value == null`
            // coercion above should make this unreachable, but guard the
            // snapshot directly so a save can never crash on it.
            this._lastSavedValue = valueToSave === undefined ? undefined : JSON.parse(JSON.stringify(valueToSave))
          } else {
            this._lastSavedValue = undefined
          }
          this._isDirty = false
        }
      )
    } finally {
      this._saving = false
      if (this._saveAgain && this._saveAgainCount++ <= 5) {
        this._saveAgain = false
        await this.save()
      } else {
        this._saveAgainCount = 0
      }
    }
  }

  /**
   * Check if the state has been modified since last save/load
   * Uses a fast hash comparison to detect changes
   */
  public isDirty(): boolean {
    if (this._isDirty) return true

    try {
      const currentHash = this.calculateHash(this.value)
      return currentHash !== this._lastSavedHash
    } catch {
      // If we can't calculate hash (circular references), consider it dirty
      // This will force a save attempt which will then throw a proper error
      return true
    }
  }

  /**
   * Mark the state as dirty (modified)
   * Useful when you know the state changed without checking
   */
  public markDirty(): void {
    this._isDirty = true
  }

  /**
   * Compute the schema default for an absent (null/undefined) value.
   *
   * Parsing `{}` applies the schema's defaults; if that fails we retry with
   * `undefined` (some schemas only default from `undefined`), and finally fall
   * back to an empty object. Shared by `load()` (initial hydration) and
   * `save()` (defensive coercion so a null value never serializes to
   * `undefined`).
   */
  private _schemaDefault(): typeof this.value {
    if (this.state && 'parse' in this.state) {
      const parse = (this.state as unknown as { parse: (v: unknown) => unknown }).parse
      try {
        return parse({}) as typeof this.value
      } catch {
        try {
          return parse(undefined) as typeof this.value
        } catch {
          return {} as typeof this.value
        }
      }
    }
    return {} as typeof this.value
  }

  /**
   * Calculate a fast hash of the value for change detection
   * Uses crypto hash for better performance with large objects
   */
  private calculateHash(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null'
    }

    try {
      // For simple values, use toString
      if (typeof value !== 'object') {
        return String(value)
      }

      // Convert state-referenceable objects to refs before hashing
      // This ensures we hash the serializable representation
      const valueToHash = serializeStateReferences(value)

      // For objects/arrays, create a hash of the JSON string
      // This is more memory efficient for large objects
      const json = JSON.stringify(valueToHash)
      return createHash('sha1').update(json).digest('hex')
    } catch {
      // If stringify fails, it's likely due to circular references
      // We should throw here as we can't save objects with circular references
      throw new Error(
        `Cannot calculate hash for object with circular references. ` +
          `Such objects cannot be tracked or saved in state.`
      )
    }
  }

  private _computeChangedKeys(newValue: unknown): string[] {
    if (
      !this._lastSavedValue ||
      typeof this._lastSavedValue !== 'object' ||
      Array.isArray(this._lastSavedValue) ||
      !newValue ||
      typeof newValue !== 'object' ||
      Array.isArray(newValue)
    ) {
      return []
    }
    const oldObj = this._lastSavedValue as Record<string, unknown>
    const newObj = newValue as Record<string, unknown>
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
    const changed: string[] = []
    for (const key of allKeys) {
      if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
        changed.push(key)
      }
    }
    return changed
  }

  public get diff(): string {
    // TODO:
    return ''
  }
}

type TrackedStateValue = z.infer<typeof TrackedStateSchema>

const parseState = (value: unknown): TrackedStateValue => {
  const result = TrackedStateSchema.safeParse(value)
  if (result.success) {
    return result.data
  } else {
    return { ...EMPTY_STATE }
  }
}
