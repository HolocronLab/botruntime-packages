import { AdkError } from '@holocronlab/botruntime-analytics'
import type {
  Agent0ProviderCatalogEntry,
  Agent0ProviderId,
  Agent0AvailableModel,
  Agent0CatalogModel,
} from '../types.js'

const apiKey = (
  apiKeyLabel = 'API key',
  baseURL?: { label?: string; placeholder?: string; defaultValue?: string; required?: boolean }
): Agent0ProviderCatalogEntry['auth'] => ({
  type: 'api_key',
  apiKeyLabel,
  ...(baseURL
    ? {
        baseURL: {
          label: baseURL.label ?? 'Base URL',
          placeholder: baseURL.placeholder,
          defaultValue: baseURL.defaultValue,
          required: baseURL.required ?? false,
        },
      }
    : {}),
})

const planned = (reason: string): Agent0ProviderCatalogEntry['auth'] => ({ type: 'planned', reason })

const modelsDev = (providerId?: string): Agent0ProviderCatalogEntry['modelSource'] => ({
  type: 'models.dev',
  ...(providerId === undefined ? {} : { providerId }),
})

const botpressCognitive = (): Agent0ProviderCatalogEntry['modelSource'] => ({
  type: 'cognitive',
})

export const AGENT0_PROVIDER_CATALOG = [
  {
    id: 'cognitive',
    name: 'Botpress Cognitive',
    description: 'First-party Botpress model access through the active ADK dev bot.',
    firstParty: true,
    status: 'available',
    enabledByDefault: true,
    auth: { type: 'none' },
    modelSource: botpressCognitive(),
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Direct OpenAI API access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('OpenAI API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Direct Anthropic API access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Anthropic API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Google Gemini API access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Gemini API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    description: 'GitHub Copilot model access.',
    firstParty: false,
    status: 'planned',
    enabledByDefault: false,
    auth: planned('GitHub Copilot requires an OAuth/device-code flow, which is outside the first simple API-key pass.'),
    modelSource: modelsDev(),
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Aggregator access to many hosted models.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('OpenRouter API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'moonshotai',
    name: 'Moonshot AI / Kimi',
    description: 'Direct Moonshot AI access to Kimi models.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Moonshot API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Direct Mistral API access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Mistral API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Groq-hosted low-latency model access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Groq API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'xai',
    name: 'xAI',
    description: 'Direct xAI API access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('xAI API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Direct DeepSeek API access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('DeepSeek API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    description: 'Cerebras-hosted model access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Cerebras API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'fireworks-ai',
    name: 'Fireworks',
    description: 'Fireworks-hosted model access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Fireworks API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'togetherai',
    name: 'Together AI',
    description: 'Together AI hosted model access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Together API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'cohere',
    name: 'Cohere',
    description: 'Direct Cohere API access.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Cohere API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'Perplexity API access for answer and research-oriented models.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Perplexity API key'),
    modelSource: modelsDev(),
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    description: 'Azure-hosted OpenAI-compatible deployments.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('Azure OpenAI API key', {
      label: 'Azure OpenAI endpoint',
      placeholder: 'https://<resource>.openai.azure.com/openai/deployments/<deployment>',
      required: true,
    }),
    modelSource: modelsDev(),
  },
  {
    id: 'amazon-bedrock',
    name: 'AWS Bedrock',
    description: 'AWS Bedrock model access.',
    firstParty: false,
    status: 'planned',
    enabledByDefault: false,
    auth: planned('AWS Bedrock needs AWS credential and region configuration, not a single API key.'),
    modelSource: modelsDev(),
  },
  {
    id: 'google-vertex',
    name: 'Vertex AI',
    description: 'Google Cloud Vertex AI model access.',
    firstParty: false,
    status: 'planned',
    enabledByDefault: false,
    auth: planned('Vertex AI needs Google Cloud project, location, and service account credentials.'),
    modelSource: modelsDev(),
  },
  {
    id: 'alibaba',
    name: 'Alibaba / Qwen / DashScope',
    description: 'Alibaba DashScope access to Qwen models.',
    firstParty: false,
    status: 'available',
    enabledByDefault: false,
    auth: apiKey('DashScope API key'),
    modelSource: modelsDev(),
  },
] as const satisfies readonly Agent0ProviderCatalogEntry[]

const CATALOG_BY_ID = new Map<Agent0ProviderId, Agent0ProviderCatalogEntry>(
  AGENT0_PROVIDER_CATALOG.map((entry) => [entry.id, entry])
)

export function listAgent0ProviderCatalog(): Agent0ProviderCatalogEntry[] {
  return [...AGENT0_PROVIDER_CATALOG]
}

export function getAgent0ProviderCatalogEntry(providerId: Agent0ProviderId): Agent0ProviderCatalogEntry | undefined {
  return CATALOG_BY_ID.get(providerId)
}

export function requireAgent0ProviderCatalogEntry(providerId: Agent0ProviderId): Agent0ProviderCatalogEntry {
  const entry = getAgent0ProviderCatalogEntry(providerId)
  if (!entry)
    throw new AdkError({
      code: 'AGENT0_PROVIDER_UNKNOWN',
      message: `Unknown Agent(0) provider: ${providerId}`,
      expected: false,
    })
  return entry
}

export function toAgent0AvailableModel(
  entry: Agent0ProviderCatalogEntry,
  model: Agent0CatalogModel
): Agent0AvailableModel {
  if (model.providerId !== entry.id) {
    throw new AdkError({
      code: 'AGENT0_MODEL_MISMATCH',
      message: `Agent(0) model ${model.modelId} belongs to ${model.providerId}, not ${entry.id}`,
      expected: false,
    })
  }

  return {
    id: `${entry.id}/${model.modelId}`,
    providerId: entry.id,
    providerName: entry.name,
    modelId: model.modelId,
    name: model.name,
    contextWindow: model.contextWindow,
    outputLimit: model.outputLimit,
    inputCostPer1MTokens: model.inputCostPer1MTokens,
    outputCostPer1MTokens: model.outputCostPer1MTokens,
    tags: model.tags ? [...model.tags] : undefined,
  }
}
