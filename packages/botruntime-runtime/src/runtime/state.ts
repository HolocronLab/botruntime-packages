import { BotState as BotStateType, UserState as UserStateType } from '../_types/state'
import { BotTags, UserTags } from '../_types/tags'

import { context } from './context/context'

// Export the state objects that can be mutated directly
// These will be properly typed when imported in user code
export const bot: { id: string; state: BotStateType; tags: BotTags } = {
  get id() {
    return context.get('botId')
  },

  get state() {
    const botId = context.get('botId')
    const states = context.get('states', { optional: true }) ?? []
    const state = states.find((x) => x.type === 'bot' && x.name === 'botState' && x.id === botId)

    if (!state) {
      throw new Error('Bot state not initialized.')
    }

    return state.value
  },
  set state(value) {
    const botId = context.get('botId')
    const states = context.get('states', { optional: true }) ?? []
    const state = states.find((x) => x.type === 'bot' && x.name === 'botState' && x.id === botId)
    if (!state) {
      throw new Error('Bot state not initialized.')
    }

    state.value = value
  },

  get tags() {
    const botId = context.get('botId')
    const tags = context.get('tags', { optional: true }) ?? []
    const trackedTags = tags.find((x) => x.type === 'bot' && x.id === botId)

    if (!trackedTags) {
      throw new Error('Bot tags not initialized.')
    }

    return trackedTags.tags as BotTags
  },
  set tags(value) {
    const botId = context.get('botId')
    const tags = context.get('tags', { optional: true }) ?? []
    const trackedTags = tags.find((x) => x.type === 'bot' && x.id === botId)
    if (!trackedTags) {
      throw new Error('Bot tags not initialized.')
    }

    trackedTags.tags = value
  },
}

const requireUserProfile = () => {
  const user = context.get('user', { optional: true })
  if (!user || !user.id) {
    throw new Error('User not found in context.')
  }

  const profiles = context.get('userProfiles', { optional: true }) ?? []
  const profile = profiles.find((p) => p.id === user.id)
  if (!profile) {
    throw new Error('User profile not initialized.')
  }

  return profile
}

export const user: {
  id: string
  state: UserStateType
  tags: UserTags
  readonly createdAt: string
  readonly updatedAt: string
  name: string | undefined
  pictureUrl: string | undefined
  properties: Record<string, string | undefined>
  attributes: Record<string, string | undefined>
} = {
  get id() {
    const user = context.get('user', { optional: true })

    if (!user || !user.id) {
      throw new Error('User not found in context.')
    }

    return user.id
  },

  get createdAt() {
    const user = context.get('user', { optional: true })

    if (!user || !user.id) {
      throw new Error('User not found in context.')
    }

    return user.createdAt
  },

  get updatedAt() {
    const user = context.get('user', { optional: true })

    if (!user || !user.id) {
      throw new Error('User not found in context.')
    }

    return user.updatedAt
  },

  get name() {
    return requireUserProfile().name
  },
  set name(value) {
    requireUserProfile().name = value
  },

  get pictureUrl() {
    return requireUserProfile().pictureUrl
  },
  set pictureUrl(value) {
    requireUserProfile().pictureUrl = value
  },

  get properties() {
    return requireUserProfile().properties
  },
  set properties(value) {
    requireUserProfile().properties = value
  },

  get attributes() {
    return requireUserProfile().attributes
  },
  set attributes(value) {
    requireUserProfile().attributes = value
  },

  get state() {
    const user = context.get('user', { optional: true })

    if (!user || !user.id) {
      throw new Error('User not found in context.')
    }

    const states = context.get('states', { optional: true }) ?? []
    const state = states.find((x) => x.type === 'user' && x.name === 'userState' && x.id === user.id)

    if (!state) {
      throw new Error('User state not initialized.')
    }

    return state.value
  },
  set state(value) {
    const user = context.get('user', { optional: true })

    if (!user || !user.id) {
      throw new Error('User not found in context.')
    }

    const states = context.get('states', { optional: true }) ?? []
    const state = states.find((x) => x.type === 'user' && x.name === 'userState' && x.id === user.id)
    if (!state) {
      throw new Error('User state not initialized.')
    }

    state.value = value
  },

  get tags() {
    const user = context.get('user', { optional: true })

    if (!user || !user.id) {
      throw new Error('User not found in context.')
    }

    const tags = context.get('tags', { optional: true }) ?? []
    const trackedTags = tags.find((x) => x.type === 'user' && x.id === user.id)

    if (!trackedTags) {
      throw new Error('User tags not initialized.')
    }

    return trackedTags.tags as UserTags
  },
  set tags(value) {
    const user = context.get('user', { optional: true })

    if (!user || !user.id) {
      throw new Error('User not found in context.')
    }

    const tags = context.get('tags', { optional: true }) ?? []
    const trackedTags = tags.find((x) => x.type === 'user' && x.id === user.id)
    if (!trackedTags) {
      throw new Error('User tags not initialized.')
    }

    trackedTags.tags = value
  },
}
