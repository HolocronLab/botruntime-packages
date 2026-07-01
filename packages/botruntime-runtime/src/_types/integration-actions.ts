import type { IntegrationActions as IA } from '@holocronlab/botruntime-runtime/_types/integration-actions'

export type IntegrationActions = IA extends never ? never : IA
