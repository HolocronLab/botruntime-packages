import type { User as BotpressUser, Client } from '@holocronlab/botruntime-client'
import { z } from '@holocronlab/botruntime-sdk'
import { UserState as UserStateType } from '../_types/state'
import { UserTags } from '../_types/tags'
import { adk } from '../library'
import { BUILT_IN_STATES, context, TrackedState, TrackedTags } from '../runtime/index'

/**
 * Represents a user instance loaded by explicit ID.
 * Provides TrackedState and TrackedTags for reading/writing user state and tags
 * outside the current execution scope.
 *
 * @example
 * ```typescript
 * import { User } from '@holocronlab/botruntime-runtime'
 *
 * const otherUser = await User.get("user-id")
 * console.log(otherUser.state)
 * otherUser.tags.myTag = "value"
 * ```
 */
export class UserInstance {
  public readonly id: string
  public readonly user: BotpressUser

  // @internal
  public readonly TrackedState: TrackedState

  // @internal
  private readonly TrackedTags: TrackedTags

  private constructor(user: BotpressUser, trackedState: TrackedState, trackedTags: TrackedTags) {
    this.id = user.id
    this.user = user
    this.TrackedState = trackedState
    this.TrackedTags = trackedTags
  }

  public get state(): UserStateType {
    return this.TrackedState.value
  }

  public set state(value: UserStateType) {
    this.TrackedState.value = value
    this.TrackedState.markDirty()
  }

  public get tags(): UserTags {
    return this.TrackedTags.tags as UserTags
  }

  public set tags(value: UserTags) {
    this.TrackedTags.tags = value as Record<string, string | undefined>
  }

  /**
   * Load a user by explicit ID.
   * Returns a UserInstance with TrackedState and TrackedTags wired up for automatic saving.
   *
   * @param id - The user ID to load
   * @returns A UserInstance with state and tags
   * @throws If called outside an execution context
   */
  static async get(id: string): Promise<UserInstance> {
    const client = context.get('client')

    const { user } = await client.getUser({ id })

    const trackedState = TrackedState.create({
      type: 'user',
      id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client._inner as any,
      schema: adk.project.config.user?.state || z.object({}).passthrough(),
      name: BUILT_IN_STATES.user,
    })

    const trackedTags = TrackedTags.create({
      type: 'user',
      id,
      client: client._inner as unknown as Client,
      initialTags: user.tags as Record<string, string | undefined>,
    })

    await trackedState.load()

    return new UserInstance(user, trackedState, trackedTags)
  }

  /**
   * Returns a string representation for console.log
   */
  toString(): string {
    return `UserInstance { id: "${this.id}" }`
  }

  /**
   * Returns a JSON representation for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
    }
  }

  /**
   * Custom inspect for Node.js console.log
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString()
  }
}
