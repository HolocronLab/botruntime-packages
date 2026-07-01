import type { Triggers as T } from '@holocronlab/botruntime-runtime/_types/triggers'

export type Triggers = T extends never ? never : T
