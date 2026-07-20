import type { ServiceMessageBundle } from 'telegraf/types'
import type { TelegramMessage } from './types'

type UnionKeys<T> = T extends T ? keyof T : never

const SERVICE_MESSAGE_FIELDS = [
  'new_chat_members',
  'left_chat_member',
  'new_chat_title',
  'new_chat_photo',
  'delete_chat_photo',
  'group_chat_created',
  'supergroup_chat_created',
  'channel_chat_created',
  'message_auto_delete_timer_changed',
  'migrate_to_chat_id',
  'migrate_from_chat_id',
  'pinned_message',
  'invoice',
  'successful_payment',
  'users_shared',
  'chat_shared',
  'connected_website',
  'write_access_allowed',
  'passport_data',
  'proximity_alert_triggered',
  'boost_added',
  'forum_topic_created',
  'forum_topic_edited',
  'forum_topic_closed',
  'forum_topic_reopened',
  'general_forum_topic_hidden',
  'general_forum_topic_unhidden',
  'giveaway_created',
  'giveaway',
  'giveaway_winners',
  'giveaway_completed',
  'video_chat_scheduled',
  'video_chat_started',
  'video_chat_ended',
  'video_chat_participants_invited',
  'web_app_data',
] as const satisfies readonly UnionKeys<ServiceMessageBundle>[]

type ServiceMessageField = (typeof SERVICE_MESSAGE_FIELDS)[number]
type UnclassifiedServiceMessage<T> = T extends T
  ? Extract<keyof T, ServiceMessageField> extends never
    ? T
    : never
  : never
type AssertNever<T extends never> = T

// Fails typecheck when @telegraf/types adds a service-message variant which the
// webhook ACK boundary has not classified yet.
type _EveryServiceMessageIsClassified = AssertNever<UnclassifiedServiceMessage<ServiceMessageBundle>>

export function isTelegramServiceMessage(message: TelegramMessage): boolean {
  return SERVICE_MESSAGE_FIELDS.some((field) => field in message)
}
