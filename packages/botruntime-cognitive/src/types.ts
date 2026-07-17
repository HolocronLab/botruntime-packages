import { ModelRef } from './models'
import { type GenerateContentInput, type GenerateContentOutput } from './schemas.gen'

export type BotpressClientLike = {
  constructor: Function
}

export type GenerationMetadata = {
  cached: boolean
  model: string
  cost: {
    input: number
    output: number
  }
  latency: number
  tokens: {
    input: number
    output: number
  }
}

/**
 * Model selector accepted by `generateContent`.
 *
 * - `'best'` / `'auto'` / `'fast'`: managed Cognitive aliases forwarded to v2.
 * - `ModelRef`: any `provider:model` string.
 */
export type InputModel = 'auto' | 'best' | 'fast' | ModelRef

export type InputProps = Omit<GenerateContentInput, 'model'> & {
  /**
   * Model to use, or an ordered list of server-side fallback models.
   */
  model?: InputModel | InputModel[]
  signal?: AbortSignal
}

export type Request = {
  input: InputProps
}

export type Response = {
  output: GenerateContentOutput
  meta: {
    cached?: boolean
    model: { integration: string; model: string }
    latency: number
    cost: { input: number; output: number }
    tokens: { input: number; output: number }
  }
}

export type CognitiveProps = {
  client: BotpressClientLike
  /** Timeout in milliseconds */
  timeout?: number
  __debug?: boolean
}

export type Events = {
  aborted: (req: Request, reason?: string) => void
  request: (req: Request) => void
  response: (req: Request, res: Response) => void
  error: (req: Request, error: any) => void
  retry: (req: Request, error: any) => void
}
