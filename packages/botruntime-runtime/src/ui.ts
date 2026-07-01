/**
 * UI-specific exports from @holocronlab/botruntime-runtime
 * This module only exports types and constants needed by the UI
 * to prevent bundling unnecessary code and dependencies
 */

export { Spans as SpanDefinitions } from './telemetry/spans/index'
export type { Spans as SpanUnion, SpanOf } from './telemetry/spans/index'
export type {
  SpanDefinition,
  AttributeDefinition,
  AttributeType,
  GetSpanType,
  TypeForAttribute,
} from './telemetry/spans/factory'
export type { SpanImportanceLevel } from './telemetry/spans'

export type InstalledComponent = {
  name: string
  sourcePath: string
  description?: string
  propsSchema: Record<string, unknown> | null
  exampleValues: unknown[]
  callbackProps: string[]
}

export type ComponentChangeEvent =
  | {
      kind: 'bundle'
      source: string
    }
  | {
      kind: 'list'
    }
  | {
      kind: 'unknown'
    }
