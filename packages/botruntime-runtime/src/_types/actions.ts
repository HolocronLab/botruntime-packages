import type { BotActions as BA } from '@holocronlab/botruntime-runtime/_types/actions'

export type BotActions = BA extends never ? never : BA
