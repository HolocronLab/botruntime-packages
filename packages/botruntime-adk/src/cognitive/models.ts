import { z } from '@holocronlab/botruntime-sdk'

const DEFAULT_BOTPRESS_API_URL = 'https://api.botpress.cloud'
const DEFAULT_FETCH_TIMEOUT_MS = 5_000

export interface BotpressCognitiveModel {
  id: string
  name: string
  tags?: string[]
  input?: { maxTokens: number; costPer1MTokens: number }
  output?: { maxTokens: number; costPer1MTokens: number }
}

export interface FetchBotpressCognitiveModelsOptions {
  token: string
  botId: string
  apiUrl?: string
  fetch?: BotpressCognitiveModelsFetch
  timeoutMs?: number
}

export interface BotpressCognitiveModelsFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type BotpressCognitiveModelsFetch = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal }
) => Promise<BotpressCognitiveModelsFetchResponse>

const cognitiveModelsResponseSchema = z.object({
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      tags: z.array(z.string()).optional(),
      input: z
        .object({
          maxTokens: z.number(),
          costPer1MTokens: z.number(),
        })
        .optional(),
      output: z
        .object({
          maxTokens: z.number(),
          costPer1MTokens: z.number(),
        })
        .optional(),
    })
  ),
})

export async function fetchBotpressCognitiveModels(
  options: FetchBotpressCognitiveModelsOptions
): Promise<BotpressCognitiveModel[] | undefined> {
  try {
    const apiUrl = options.apiUrl || DEFAULT_BOTPRESS_API_URL
    const fetchImpl = options.fetch ?? fetch
    const res = await fetchImpl(`${apiUrl}/v2/cognitive/models`, {
      headers: {
        Authorization: `Bearer ${options.token}`,
        'X-Bot-Id': options.botId,
      },
      ...(options.timeoutMs === 0
        ? {}
        : { signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS) }),
    })
    if (!res.ok) return undefined

    const { models } = cognitiveModelsResponseSchema.parse(await res.json())
    const filtered = models.filter(
      (model) =>
        !model.tags?.includes('speech-to-text') &&
        !model.tags?.includes('deprecated') &&
        !model.tags?.includes('discontinued')
    )
    const nameCounts = new Map<string, number>()
    for (const model of filtered) nameCounts.set(model.name, (nameCounts.get(model.name) ?? 0) + 1)

    return filtered.map((model) => {
      if (nameCounts.get(model.name)! > 1) {
        const provider = model.id.split(':')[0] ?? ''
        return { ...model, name: `${model.name} (${provider})` }
      }
      return model
    })
  } catch {
    // Callers treat undefined as "model list unavailable" and fall back to
    // defaults.
    // TODO(ADK-638): debug-log the fetch error via the injected logger once
    // adk has one, so an outage/bad token isn't completely silent.
    return undefined
  }
}

export function toCognitiveModelKey(id: string): string {
  return id.replace(':', '--')
}
