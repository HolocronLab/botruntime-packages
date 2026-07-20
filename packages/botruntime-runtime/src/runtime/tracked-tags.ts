import { Client } from '@holocronlab/botruntime-client'
import { context } from './context/context'
import { span } from '../telemetry/tracing'
import { adk } from './adk'

/**
 * Built-in tag definitions that must be consistent between runtime and code generation.
 *
 * These tags are automatically available and don't need to be defined in agent.config.ts
 *
 * IMPORTANT: Tag names must be alphanumeric (camelCase), start with a lowercase letter,
 * and be between 2 and 100 characters in length per Botpress API requirements.
 */
export const BUILT_IN_TAGS = {
  conversation: {
    /** Stable discriminator for durable hosted eval resources. */
    id: {
      title: 'Resource Identity',
      description: 'Built-in: Stable resource discriminator used by platform-managed get-or-create operations.',
    },
    /** Last synced message timestamp - automatically updated when messages are processed */
    adkSyncTs: {
      title: 'Runtime Sync Timestamp',
      description:
        'Built-in: Last synced message timestamp. Automatically updated by the runtime when messages are processed.',
    },
    /** Set when a conversation session expires via lifecycle management */
    sessionExpired: {
      title: 'Session Expired',
      description: 'Built-in: Set to "true" when a conversation session expires via lifecycle management.',
    },
  },
  user: {
    /** Stable discriminator for durable hosted eval resources. */
    id: {
      title: 'Resource Identity',
      description: 'Built-in: Stable resource discriminator used by platform-managed get-or-create operations.',
    },
  },
  bot: {},
  message: {
    /** Stable discriminator for durable hosted eval effects. */
    id: {
      title: 'Message Identity',
      description: 'Built-in: Stable message discriminator used by platform-managed get-or-create operations.',
    },
    /** Session ID for the message - groups messages by lifecycle session */
    sessionId: {
      title: 'Session ID',
      description: 'Built-in: ULID identifying which lifecycle session this message belongs to.',
    },
    /** Session number for the message - increments on each session expiration */
    sessionNumber: {
      title: 'Session Number',
      description: 'Built-in: Session sequence number, increments each time the conversation session expires.',
    },
  },
  workflow: {
    /** Stable discriminator for durable hosted eval resources. */
    id: {
      title: 'Workflow Identity',
      description: 'Built-in: Stable workflow discriminator used by platform-managed get-or-create operations.',
    },
  },
} as const

/**
 * Check if a tag key is a system tag (contains ':').
 * System tags like "webchat:owner" are managed by integrations and should not be modified by bots.
 */
function isSystemTag(key: string): boolean {
  return key.includes(':')
}

/**
 * Check if a tag key is a plugin tag (contains '#').
 * Plugin tags like "desk-hitl#deskMode" are namespaced by the plugin alias and
 * managed by the plugin itself, so they are not declared in the bot's
 * agent.config.ts. They are persisted as-is and never warned about.
 */
function isPluginTag(key: string): boolean {
  return key.includes('#')
}

/**
 * Check if a tag key is a built-in runtime tag for any entity type.
 * Built-in tags are always allowed and don't need to be defined in agent.config.ts
 */
function isBuiltInTag(key: string): boolean {
  return (
    key in BUILT_IN_TAGS.bot ||
    key in BUILT_IN_TAGS.user ||
    key in BUILT_IN_TAGS.conversation ||
    key in BUILT_IN_TAGS.message ||
    key in BUILT_IN_TAGS.workflow
  )
}

/**
 * Get built-in tag keys for a specific entity type
 */
function getBuiltInTagsForType(type: 'bot' | 'user' | 'conversation' | 'workflow'): string[] {
  return Object.keys(BUILT_IN_TAGS[type])
}

/**
 * TrackedTags manages tags for bot, user, conversation, and workflow entities.
 * Tags are key-value pairs where values are strings or undefined.
 * Changes are tracked and persisted automatically.
 *
 * Note: System tags (containing ':') are read-only and will be ignored during saves and dirty checks.
 */
export class TrackedTags {
  type: 'bot' | 'user' | 'conversation' | 'workflow'
  id: string
  client: Client

  private _tags: Record<string, string | undefined> = {}
  private _initialTags: Record<string, string | undefined> = {}
  private _loaded: boolean = false
  private _saving: boolean = false
  private _saveAgain: boolean = false
  private _saveAgainCount: number = 0

  private static _savingAll: boolean = false
  private static _saveAllAgain: boolean = false
  private static _saveAllCount: number = 0

  private constructor(props: { type: 'bot' | 'user' | 'conversation' | 'workflow'; id: string; client: Client }) {
    this.type = props.type
    this.id = props.id
    this.client = props.client
  }

  public static create(props: {
    type: 'bot' | 'user' | 'conversation' | 'workflow'
    id: string
    client: Client
    initialTags?: Record<string, string | undefined>
  }): TrackedTags {
    const tags = context.get('tags', { optional: true })
    const executionFinished = context.get('executionFinished', { optional: true })

    if (executionFinished) {
      throw new Error(`Cannot create new TrackedTags "${props.type}/${props.id}" after execution has finished.`)
    }

    const match = tags?.find((x) => x.id === props.id && x.type === props.type)

    if (match) {
      return match
    }

    const instance = new TrackedTags(props)

    // Get built-in tag keys for this type
    const builtInTagKeys = getBuiltInTagsForType(props.type)
    const builtInTagDefaults: Record<string, string | undefined> = {}
    for (const key of builtInTagKeys) {
      builtInTagDefaults[key] = undefined // Start as undefined, will be set by application logic
    }

    // Prime the tags if provided (saves a roundtrip)
    // Merge built-in tags with initialTags (initialTags take precedence)
    if (props.initialTags) {
      instance._tags = { ...builtInTagDefaults, ...props.initialTags }
      instance._initialTags = { ...builtInTagDefaults, ...props.initialTags }
      instance._loaded = true
    } else {
      instance._tags = { ...builtInTagDefaults }
      instance._initialTags = { ...builtInTagDefaults }
    }

    tags?.push(instance)

    return instance
  }

  public static async saveAllDirty() {
    if (this._savingAll) {
      this._saveAllAgain = true
      return
    }

    try {
      this._savingAll = true

      const tags = context.get('tags', { optional: true })
      const dirtyTags = tags?.filter((t) => t.isDirty()) || []
      if (!dirtyTags.length) {
        return
      }

      await span(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- span name not in strict union type
        'tags.saveAllDirty' as any,
        {
          tags_count: tags?.length || 0,
          tags: tags.map((t) => `${t.type}/${t.id}`),
        },
        () => Promise.allSettled(dirtyTags.map((t) => t.save()))
      )
    } finally {
      this._savingAll = false
      if (this._saveAllAgain && this._saveAllCount++ <= 5) {
        this._saveAllAgain = false
        await this.saveAllDirty()
      } else {
        this._saveAllCount = 0
      }
    }
  }

  public static async loadAll() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- span name not in strict union type
    await span('tags.loadAll' as any, {}, async () => {
      const client = context.get('client')._inner as unknown as Client
      const bot = context.get('bot', { optional: true })
      const user = context.get('user', { optional: true })
      const conversation = context.get('conversation', { optional: true })
      const workflow = context.get('workflow', { optional: true })

      if (bot) {
        // Prime bot tags from already-loaded bot entity
        const botTags = bot.tags as Record<string, string | undefined> | undefined
        TrackedTags.create({
          client,
          type: 'bot',
          id: bot.id,
          ...(botTags && { initialTags: botTags }),
        })
      }

      if (user) {
        // Prime user tags from already-loaded user entity
        const userTags = user.tags as Record<string, string | undefined> | undefined
        TrackedTags.create({
          client,
          type: 'user',
          id: user.id,
          ...(userTags && { initialTags: userTags }),
        })
      }

      if (conversation) {
        // Prime conversation tags from already-loaded conversation entity
        const conversationTags = conversation.tags as Record<string, string | undefined> | undefined
        TrackedTags.create({
          client,
          type: 'conversation',
          id: conversation.id,
          ...(conversationTags && { initialTags: conversationTags }),
        })
      }

      if (workflow) {
        // Prime workflow tags from already-loaded workflow entity
        const workflowTags = workflow.tags as Record<string, string | undefined> | undefined
        TrackedTags.create({
          client,
          type: 'workflow',
          id: workflow.id,
          ...(workflowTags && { initialTags: workflowTags }),
        })
      }

      // Load any tags that weren't primed (should be none in most cases)
      const tags = context.get('tags', { optional: true })
      const unloadedTags = tags?.filter((tag) => !tag._loaded) ?? []
      if (unloadedTags.length > 0) {
        await Promise.allSettled(unloadedTags.map((tag) => tag.load()))
      }
    })
  }

  public static unloadAll() {
    context.get('tags', { optional: true })?.splice(0)
  }

  public async load(force: boolean = false) {
    if (this._loaded && !force) {
      return
    }

    await span(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- span name not in strict union type
      'tags.load' as any,
      {
        type: this.type,
        id: this.id,
      },
      async () => {
        // Get built-in tag keys for this type
        const builtInTagKeys = getBuiltInTagsForType(this.type)
        const builtInTagDefaults: Record<string, string | undefined> = {}
        for (const key of builtInTagKeys) {
          builtInTagDefaults[key] = undefined
        }

        // Load tags from the entity and merge with built-in tags
        const tags = await this.fetchTags()
        this._tags = { ...builtInTagDefaults, ...tags }
        this._initialTags = { ...builtInTagDefaults, ...tags }
        this._loaded = true
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
      throw new Error(`Cannot save TrackedTags "${this.type}/${this.id}" after execution has finished.`)
    }

    try {
      this._saving = true

      await span(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- span name not in strict union type
        'tags.save' as any,
        {
          type: this.type,
          id: this.id,
        },
        async () => {
          await this.persistTags(this._tags)
          this._initialTags = { ...this._tags }
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

  public isDirty(): boolean {
    // Compare current tags with initial tags, ignoring system tags (containing ':')
    const currentKeys = Object.keys(this._tags)
      .filter((k) => !isSystemTag(k))
      .sort()
    const initialKeys = Object.keys(this._initialTags)
      .filter((k) => !isSystemTag(k))
      .sort()

    if (currentKeys.length !== initialKeys.length) {
      return true
    }

    for (const key of currentKeys) {
      if (this._tags[key] !== this._initialTags[key]) {
        return true
      }
    }

    return false
  }

  public get tags(): Record<string, string | undefined> {
    return new Proxy(this._tags, {
      set: (target, prop: string, value: string | undefined) => {
        // Silently ignore system tags - they are managed by integrations
        if (isSystemTag(prop)) {
          return true
        }
        target[prop] = value
        return true
      },
      deleteProperty: (target, prop: string) => {
        // Silently ignore system tags - they are managed by integrations
        if (isSystemTag(prop)) {
          return true
        }
        target[prop] = undefined
        return true
      },
    })
  }

  public set tags(value: Record<string, string | undefined>) {
    this._tags = { ...value }
  }

  private async fetchTags(): Promise<Record<string, string | undefined>> {
    try {
      if (this.type === 'bot') {
        const { bot } = await this.client.getBot({ id: this.id })
        return bot.tags || {}
      } else if (this.type === 'user') {
        const { user } = await this.client.getUser({ id: this.id })
        return user.tags || {}
      } else if (this.type === 'conversation') {
        const { conversation } = await this.client.getConversation({ id: this.id })
        return conversation.tags || {}
      } else if (this.type === 'workflow') {
        const { workflow } = await this.client.getWorkflow({ id: this.id })
        return workflow.tags || {}
      }
    } catch (err) {
      console.error(`Failed to fetch tags for ${this.type}/${this.id}:`, err)
    }
    return {}
  }

  /**
   * Get the list of valid tag keys from the agent configuration.
   * Only tags defined in agent.config.ts can be persisted.
   */
  private getValidTagKeys(): Set<string> {
    const validKeys = new Set<string>()

    try {
      const config = adk.project.config

      if (this.type === 'bot' && config.bot?.tags) {
        Object.keys(config.bot.tags).forEach((key) => validKeys.add(key))
      } else if (this.type === 'user' && config.user?.tags) {
        Object.keys(config.user.tags).forEach((key) => validKeys.add(key))
      } else if (this.type === 'conversation' && config.conversation?.tags) {
        Object.keys(config.conversation.tags).forEach((key) => validKeys.add(key))
      } else if (this.type === 'workflow' && config.workflow?.tags) {
        Object.keys(config.workflow.tags).forEach((key) => validKeys.add(key))
      }
    } catch (err) {
      // If we can't get the config, we'll just allow all tags
      console.warn(`[TrackedTags] Could not load tag definitions from config: ${err}`)
    }

    return validKeys
  }

  private async persistTags(tags: Record<string, string | undefined>): Promise<void> {
    // Get valid tag keys from the agent configuration
    const validKeys = this.getValidTagKeys()

    // Filter out undefined values and system tags (containing ':')
    // System tags like "webchat:owner" are managed by integrations and cannot be modified
    // Also filter out tags that are not defined in agent.config.ts
    const tagsForApi: Record<string, string> = {}
    const skippedTags: string[] = []

    for (const [key, value] of Object.entries(tags)) {
      if (value === undefined || isSystemTag(key)) {
        continue
      }

      // Built-in runtime tags are always allowed (e.g., adk_sync_ts).
      // Plugin tags (alias#tagName) are managed by the plugin and not declared
      // in the bot's config, so they are persisted as-is without warning.
      // Otherwise only persist tags defined in the schema or that are built-in.
      if (isBuiltInTag(key) || isPluginTag(key) || validKeys.size === 0 || validKeys.has(key)) {
        tagsForApi[key] = value
      } else {
        skippedTags.push(key)
        // Remove undefined tags from tracking to prevent repeated attempts
        delete this._tags[key]
        delete this._initialTags[key]
      }
    }

    if (skippedTags.length > 0) {
      console.warn(
        `[TrackedTags] Skipping tags not defined in agent.config.ts for ${this.type}/${this.id}: ${skippedTags.join(', ')}`
      )
    }

    try {
      if (this.type === 'bot') {
        await this.client.updateBot({ id: this.id, tags: tagsForApi })
      } else if (this.type === 'user') {
        await this.client.updateUser({ id: this.id, tags: tagsForApi })
      } else if (this.type === 'conversation') {
        await this.client.updateConversation({ id: this.id, tags: tagsForApi })
      } else if (this.type === 'workflow') {
        await this.client.updateWorkflow({ id: this.id, tags: tagsForApi })
      }
    } catch (err: unknown) {
      console.error(`Failed to persist tags for ${this.type}/${this.id}:`, err)
      throw err
    }
  }
}
