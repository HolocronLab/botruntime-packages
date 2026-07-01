import type { Secrets as S } from '@holocronlab/botruntime-runtime/_types/secrets'

export type Secrets = S extends never ? Record<string, string | undefined> : S
