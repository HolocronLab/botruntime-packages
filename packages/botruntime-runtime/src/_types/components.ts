/**
 * Virtual module for custom component type definitions
 *
 * This module is populated by code generation from the ADK.
 * The actual types are declared in `.adk/component-types.d.ts` via module augmentation.
 */
import type { CustomComponentMessage as M } from '@holocronlab/botruntime-runtime/_types/components'

export type CustomComponentMessage = M extends never
  ? {
      component: any
      props: any
    }
  : M
