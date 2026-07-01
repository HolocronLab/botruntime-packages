import type { BotState as BS, UserState as US } from '@holocronlab/botruntime-runtime/_types/state'

export type BotState = BS extends never ? never : BS
export type UserState = US extends never ? never : US
