import type { TableDefinitions as TD } from '@holocronlab/botruntime-runtime/_types/tables'

export type TableDefinitions = TD extends never ? never : TD
