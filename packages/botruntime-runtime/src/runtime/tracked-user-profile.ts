import { Client } from '@holocronlab/botruntime-client'
import { context } from './context/context'
import { span } from '../telemetry/tracing'

type ProfileFields = {
  name: string | undefined
  pictureUrl: string | undefined
  properties: Record<string, string | undefined> | undefined
  attributes: Record<string, string | undefined> | undefined
}

/**
 * TrackedUserProfile manages writable profile fields on a user entity
 * (`name`, `pictureUrl`, `properties`, `attributes`).
 *
 * Mutations are staged in-memory and flushed to the Botpress API at the end
 * of the request via `saveAllDirty()`, mirroring the pattern used by
 * `TrackedState` and `TrackedTags`.
 */
export class TrackedUserProfile {
  id: string
  client: Client

  private _profile: ProfileFields = emptyProfile()
  private _initialProfile: ProfileFields = emptyProfile()
  private _loaded: boolean = false
  private _saving: boolean = false
  private _saveAgain: boolean = false
  private _saveAgainCount: number = 0

  private static _saveChain: Promise<void> = Promise.resolve()

  private constructor(props: { id: string; client: Client }) {
    this.id = props.id
    this.client = props.client
  }

  public static create(props: {
    id: string
    client: Client
    initialProfile?: Partial<ProfileFields>
  }): TrackedUserProfile {
    const profiles = context.get('userProfiles', { optional: true })
    const executionFinished = context.get('executionFinished', { optional: true })

    if (executionFinished) {
      throw new Error(`Cannot create new TrackedUserProfile "${props.id}" after execution has finished.`)
    }

    const match = profiles?.find((x) => x.id === props.id)

    if (match) {
      return match
    }

    const instance = new TrackedUserProfile(props)

    if (props.initialProfile) {
      instance._profile = cloneProfile(props.initialProfile)
      instance._initialProfile = cloneProfile(props.initialProfile)
      instance._loaded = true
    }

    profiles?.push(instance)

    return instance
  }

  public static async loadAll() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- span name not in strict union type
    await span('userProfile.loadAll' as any, {}, async () => {
      const client = context.get('client')._inner as unknown as Client
      const user = context.get('user', { optional: true })

      if (user) {
        TrackedUserProfile.create({
          client,
          id: user.id,
          initialProfile: {
            name: user.name,
            pictureUrl: user.pictureUrl,
            properties: user.properties as Record<string, string | undefined> | undefined,
            attributes: user.attributes as Record<string, string | undefined> | undefined,
          },
        })
      }

      const profiles = context.get('userProfiles', { optional: true })
      const unloaded = profiles?.filter((p) => !p._loaded) ?? []
      if (unloaded.length > 0) {
        await Promise.allSettled(unloaded.map((p) => p.load()))
      }
    })
  }

  public static async saveAllDirty(): Promise<void> {
    // Serialize concurrent saves through a chain so every caller runs (and awaits)
    // its own save pass in its own execution context. A static "skip if already
    // saving" guard is unsafe across requests: a caller arriving mid-flight would
    // return early, and the retry would run in the first caller's context —
    // silently skipping the second request's dirty profiles. Mirrors
    // TrackedState.saveAllDirty.
    const run = this._saveChain.then(
      () => this._saveAllDirtyOnce(),
      () => this._saveAllDirtyOnce()
    )
    // Keep the chain alive regardless of this run's outcome, so one caller's
    // rejection doesn't poison the next caller's save.
    this._saveChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private static async _saveAllDirtyOnce(): Promise<void> {
    const profiles = context.get('userProfiles', { optional: true })
    const dirty = profiles?.filter((p) => p.isDirty()) || []
    if (!dirty.length) {
      return
    }

    await span(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- span name not in strict union type
      'userProfile.saveAllDirty' as any,
      {
        profiles_count: profiles?.length || 0,
        profiles: profiles?.map((p) => p.id) ?? [],
      },
      () => Promise.allSettled(dirty.map((p) => p.save()))
    )
  }

  public static unloadAll() {
    context.get('userProfiles', { optional: true })?.splice(0)
  }

  public async load(force: boolean = false) {
    if (this._loaded && !force) {
      return
    }

    await span(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- span name not in strict union type
      'userProfile.load' as any,
      { id: this.id },
      async () => {
        try {
          const { user } = await this.client.getUser({ id: this.id })
          const snapshot: ProfileFields = {
            name: user.name,
            pictureUrl: user.pictureUrl,
            properties: user.properties as Record<string, string | undefined> | undefined,
            attributes: user.attributes as Record<string, string | undefined> | undefined,
          }
          this._profile = cloneProfile(snapshot)
          this._initialProfile = cloneProfile(snapshot)
          this._loaded = true
        } catch (err) {
          console.error(`Failed to fetch user profile for ${this.id}:`, err)
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
      throw new Error(`Cannot save TrackedUserProfile "${this.id}" after execution has finished.`)
    }

    try {
      this._saving = true

      await span(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- span name not in strict union type
        'userProfile.save' as any,
        { id: this.id },
        async () => {
          const payload = this._buildUpdatePayload()
          if (payload === null) return

          // Snapshot exactly what we're sending. If profile fields mutate while
          // the updateUser call is in flight, those later changes must stay
          // dirty — so we mark only the sent state clean, not the live profile
          // (which could now include un-sent mutations).
          const sentProfile = cloneProfile(this._profile)

          try {
            await this.client.updateUser({ id: this.id, ...payload })
            this._initialProfile = sentProfile
          } catch (err) {
            console.error(`Failed to persist user profile for ${this.id}:`, err)
            throw err
          }
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
    if (this._profile.name !== this._initialProfile.name) return true
    if (this._profile.pictureUrl !== this._initialProfile.pictureUrl) return true
    if (diffRecord(this._profile.properties, this._initialProfile.properties)) return true
    if (diffRecord(this._profile.attributes, this._initialProfile.attributes)) return true
    return false
  }

  public get name(): string | undefined {
    return this._profile.name
  }

  public set name(value: string | undefined) {
    this._profile.name = value
  }

  public get pictureUrl(): string | undefined {
    return this._profile.pictureUrl
  }

  public set pictureUrl(value: string | undefined) {
    this._profile.pictureUrl = value
  }

  public get properties(): Record<string, string | undefined> {
    this._profile.properties ??= {}
    return wrapMap(this._profile.properties)
  }

  public set properties(value: Record<string, string | undefined>) {
    this._profile.properties = { ...value }
  }

  public get attributes(): Record<string, string | undefined> {
    this._profile.attributes ??= {}
    return wrapMap(this._profile.attributes)
  }

  public set attributes(value: Record<string, string | undefined>) {
    this._profile.attributes = { ...value }
  }

  private _buildUpdatePayload(): {
    name?: string | null
    pictureUrl?: string | null
    properties?: Record<string, string | null>
    attributes?: Record<string, string | null>
  } | null {
    const payload: {
      name?: string | null
      pictureUrl?: string | null
      properties?: Record<string, string | null>
      attributes?: Record<string, string | null>
    } = {}
    let hasChange = false

    if (this._profile.name !== this._initialProfile.name) {
      payload.name = this._profile.name === undefined ? null : this._profile.name
      hasChange = true
    }

    if (this._profile.pictureUrl !== this._initialProfile.pictureUrl) {
      payload.pictureUrl = this._profile.pictureUrl === undefined ? null : this._profile.pictureUrl
      hasChange = true
    }

    const propertiesDiff = diffForUpdate(this._profile.properties, this._initialProfile.properties)
    if (propertiesDiff) {
      payload.properties = propertiesDiff
      hasChange = true
    }

    const attributesDiff = diffForUpdate(this._profile.attributes, this._initialProfile.attributes)
    if (attributesDiff) {
      payload.attributes = attributesDiff
      hasChange = true
    }

    return hasChange ? payload : null
  }
}

function emptyProfile(): ProfileFields {
  return { name: undefined, pictureUrl: undefined, properties: undefined, attributes: undefined }
}

function cloneProfile(p: Partial<ProfileFields>): ProfileFields {
  return {
    name: p.name,
    pictureUrl: p.pictureUrl,
    properties: p.properties ? { ...p.properties } : undefined,
    attributes: p.attributes ? { ...p.attributes } : undefined,
  }
}

function diffRecord(
  current: Record<string, string | undefined> | undefined,
  initial: Record<string, string | undefined> | undefined
): boolean {
  const currentKeys = Object.keys(current ?? {})
  const initialKeys = Object.keys(initial ?? {})
  const keys = new Set([...currentKeys, ...initialKeys])
  for (const k of keys) {
    if ((current ?? {})[k] !== (initial ?? {})[k]) return true
  }
  return false
}

function diffForUpdate(
  current: Record<string, string | undefined> | undefined,
  initial: Record<string, string | undefined> | undefined
): Record<string, string | null> | null {
  if (!current && !initial) return null
  const out: Record<string, string | null> = {}
  let hasChange = false
  const keys = new Set([...Object.keys(current ?? {}), ...Object.keys(initial ?? {})])
  for (const k of keys) {
    const cur = (current ?? {})[k]
    const init = (initial ?? {})[k]
    if (cur !== init) {
      out[k] = cur === undefined ? null : cur
      hasChange = true
    }
  }
  return hasChange ? out : null
}

function wrapMap(target: Record<string, string | undefined>): Record<string, string | undefined> {
  return new Proxy(target, {
    set: (t, prop: string, value: string | undefined) => {
      t[prop] = value
      return true
    },
    deleteProperty: (t, prop: string) => {
      t[prop] = undefined
      return true
    },
  })
}
