import type { Configuration as C } from '@holocronlab/botruntime-runtime/_types/configuration'

export type Configuration = C extends never ? never : C
