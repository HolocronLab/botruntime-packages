import type {
  BotTags as BT,
  UserTags as UT,
  ConversationTags as CT,
  MessageTags as MT,
  WorkflowTags as WT,
} from '@holocronlab/botruntime-runtime/_types/tags'

export type BotTags = BT extends never ? Record<string, string | undefined> : BT
export type UserTags = UT extends never ? Record<string, string | undefined> : UT
export type ConversationTags = CT extends never ? Record<string, string | undefined> : CT
export type MessageTags = MT extends never ? Record<string, string | undefined> : MT
export type WorkflowTags = WT extends never ? Record<string, string | undefined> : WT
