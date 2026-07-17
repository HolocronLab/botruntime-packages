import { Model as RawModel } from './schemas.gen'

export type ModelRef = `${string}:${string}`

export type Model = RawModel & {
  ref: ModelRef
  /** Managed Cognitive transport identifier; generation never dispatches integration actions. */
  integration: string
}
