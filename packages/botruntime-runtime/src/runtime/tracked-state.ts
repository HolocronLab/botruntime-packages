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

const isStateVersionConflict = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const error = value as { code?: unknown; type?: unknown }
  return error.code === 409 && error.type === 'ResourceLockedConflict'
}

const stateSwapIdentity = (
  type: 'conversation' | 'user' | 'bot' | 'workflow',
  id: string,
  name: string
): string => createHash('sha256').update(JSON.stringify([type, id, name])).digest('hex')

const stateSwapPrefix = (
  type: 'conversation' | 'user' | 'bot' | 'workflow',
  id: string,
  name: string
): string => `swap/state/v2/${stateSwapIdentity(type, id, name)}/`

const stateSwapKey = (
  type: 'conversation' | 'user' | 'bot' | 'workflow',
  id: string,
  name: string,
  expectedVersion: number | undefined,
  serializedJSON: string
): string => {
  const contentHash = createHash('sha256').update(serializedJSON).digest('hex')
  const generation = expectedVersion === undefined ? 'legacy' : `version-${expectedVersion}`
  return `${stateSwapPrefix(type, id, name)}${generation}/${contentHash}.json`
}

type OwnedSwapFile = {
  id: string
  key: string
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
  private _version: number | undefined
  private _versionConflict: unknown | undefined
  private _loadedSwapFile: OwnedSwapFile | undefined
  private _isDirty: boolean = false
  private _loaded: boolean = false

  private _saving: boolean = false
  private _savePromise: Promise<void> | null = null
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

    // A CAS conflict is an intentional fail-loud signal that another execution
    // changed the same state. Swallowing it would report success after losing a
    // mutation, while retrying the stale snapshot would overwrite the winner.
    const conflict = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === 'rejected' && isStateVersionConflict(result.reason)
    )
    if (conflict) throw conflict.reason

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
        const response = await this.client.getOrSetState({
          type: this.type,
          name: this.name,
          id: this.id,
          payload: { ...EMPTY_STATE },
        })
        const { location, value } = await this._loadStoredState(response.state, true)

        s.setAttribute('has_value', value !== undefined)
        s.setAttribute('location', location.type)
        this.value = value as typeof this.value

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

  public save(): Promise<void> {
    if (this._saving) {
      this._saveAgain = true
      return this._savePromise!
    }

    this._assertCanSave()
    this._saving = true
    const savePromise = Promise.resolve().then(() => this._drainSaves())
    this._savePromise = savePromise
    return savePromise
  }

  private async _drainSaves(): Promise<void> {
    try {
      do {
        this._saveAgain = false
        this._assertCanSave()
        await this._saveSnapshot()
      } while (this._saveAgain && this._saveAgainCount++ <= 5)
    } finally {
      this._saving = false
      this._savePromise = null
      this._saveAgain = false
      this._saveAgainCount = 0
    }
  }

  private _assertCanSave(): void {
    // Request cleanup can invoke saveAllDirty more than once. Once Cloud has
    // rejected this snapshot as stale, every later pass in the same execution
    // must rethrow locally instead of replaying it. A successful load refreshes
    // the version and clears this latch.
    if (this._versionConflict !== undefined) {
      throw this._versionConflict
    }

    const executionFinished = context.get('executionFinished', {
      optional: true,
    })

    if (executionFinished) {
      throw new Error(
        `Cannot save TrackedState "${this.type}/${this.id}/${this.name || 'state'}" after execution has finished.`
      )
    }
  }

  private async _saveSnapshot(): Promise<void> {
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
        const serializedValue = serializeStateReferences(this.value)
        let serializedJSON: string | undefined

        // Check if the object can be serialized (no circular references)
        try {
          serializedJSON = JSON.stringify(serializedValue)
        } catch {
          throw new Error(
            `State contains circular references and cannot be saved. ` +
              `Objects with circular references are not supported in state storage. ` +
              `Consider restructuring your data to avoid circular references.`
          )
        }
        if (serializedJSON === undefined) {
          throw new Error('State cannot be serialized to JSON and cannot be saved.')
        }

        const valueToSave = JSON.parse(serializedJSON)
        const savedHash = this.calculateHash(valueToSave)
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

        const expectedVersion = this._version
        const previousSwapFile = this._loadedSwapFile
        let candidateSwapFile: OwnedSwapFile | undefined
        let payload: TrackedStateValue

        if (!tooBig) {
          payload = {
            value: valueToSave,
            location: { type: 'state' },
          }
        } else {
          try {
            // The file is uploaded before the state CAS. Its key must therefore
            // be immutable: a losing writer must not overwrite the bytes that
            // the winning state row already references.
            const key = stateSwapKey(this.type, this.id, this.name, expectedVersion, serializedJSON)
            const { file } = await this.client.uploadFile({
              key,
              index: false,
              contentType: 'application/json',
              content: serializedJSON,
              accessPolicies: [],
              tags: {
                system: 'true',
                purpose: 'swap',
              },
            })
            candidateSwapFile = { id: file.id, key }

            console.warn(
              `State for ${this.type}/${this.id} is too big (${tooBig.human}) for State API (max ${MaxStateSize.human}). ` +
                `Swapping state to file ${file.id}.`
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

        let response
        try {
          response = await this.client.setState({
            type: this.type,
            name: this.name,
            id: this.id,
            payload,
            ...(expectedVersion === undefined ? {} : { expectedVersion }),
          })
        } catch (error: unknown) {
          if (isStateVersionConflict(error)) {
            this._versionConflict = error
            if (expectedVersion !== undefined && candidateSwapFile) {
              await this._cleanupRejectedSwapCandidate(candidateSwapFile)
            }
          }
          throw error
        }
        this._rememberVersion(response?.state)
        this._loadedSwapFile = candidateSwapFile
        // Only a successful CAS proves that the previously loaded pointer was
        // superseded by this write. Legacy LWW saves keep their files because a
        // concurrent legacy writer can move the pointer again without fencing.
        if (
          expectedVersion !== undefined &&
          previousSwapFile &&
          previousSwapFile.id !== candidateSwapFile?.id
        ) {
          await this._deleteSwapFileBestEffort(previousSwapFile)
        }

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
        this._lastSavedHash = savedHash
        if (savedInline) {
          this._lastSavedValue = valueToSave
        } else {
          this._lastSavedValue = undefined
        }
        try {
          this._isDirty = this.calculateHash(this.value) !== savedHash
        } catch {
          this._isDirty = true
        }
      }
    )
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

  private _rememberVersion(state: { version?: unknown } | undefined): void {
    const version = state?.version
    this._version =
      typeof version === 'number' && Number.isSafeInteger(version) && version > 0
        ? version
        : undefined
    this._versionConflict = undefined
  }

  private async _loadStoredState(
    state: { payload: unknown; version?: unknown },
    refreshOnFileFailure: boolean
  ): Promise<TrackedStateValue> {
    this._rememberVersion(state)
    const parsed = parseState(state.payload)
    if (parsed.location.type !== 'file') {
      this._loadedSwapFile = undefined
      return parsed
    }

    try {
      const { file } = await this.client.getFile({
        id: parsed.location.key as FileId,
      })
      const { data } = await axios.get(file.url)
      this._loadedSwapFile = this._ownedSwapFile(file.id, file.key)
      return {
        location: parsed.location,
        value: typeof data === 'string' ? JSON.parse(data) : data,
      }
    } catch (error) {
      if (refreshOnFileFailure) {
        // A CAS winner may have flipped the row and removed the old owned file
        // after this load read the stale pointer. Re-read the authoritative row
        // exactly once; never loop or replay a user mutation from the load path.
        try {
          const refreshed = await this.client.getState({
            type: this.type,
            name: this.name,
            id: this.id,
          })
          return await this._loadStoredState(refreshed.state, false)
        } catch (refreshError) {
          error = refreshError
        }
      }

      this._loadedSwapFile = undefined
      console.error(
        `Failed to load swapped state from file: ${error instanceof Error ? error.message : String(error)}`
      )
      return {
        location: parsed.location,
        value: undefined,
      }
    }
  }

  private _ownedSwapFile(id: string, key: string): OwnedSwapFile | undefined {
    return key.startsWith(stateSwapPrefix(this.type, this.id, this.name)) ? { id, key } : undefined
  }

  private async _cleanupRejectedSwapCandidate(candidate: OwnedSwapFile): Promise<void> {
    // Same-version, same-content contenders intentionally share a candidate.
    // A 409 loser may delete it only after the authoritative row proves that
    // another pointer won.
    try {
      const current = await this.client.getState({
        type: this.type,
        name: this.name,
        id: this.id,
      })
      const parsed = TrackedStateSchema.safeParse(current.state.payload)
      if (!parsed.success) return
      if (parsed.data.location.type === 'file' && parsed.data.location.key === candidate.id) return
    } catch {
      return
    }

    await this._deleteSwapFileBestEffort(candidate)
  }

  private async _deleteSwapFileBestEffort(file: OwnedSwapFile): Promise<void> {
    try {
      await this.client.deleteFile({ id: file.id as FileId })
    } catch (error) {
      console.warn(
        `Failed to delete superseded swapped state file ${file.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
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
