import type { Events as E, EventName as EN, EventPayload as EP } from '@holocronlab/botruntime-runtime/_types/events'

export type Events = E extends never ? never : E
export type EventName = EN extends never ? never : EN
export type EventPayload<T extends EventName> = EP<T> extends never ? never : EP<T>
