import { createHash } from 'node:crypto'
import { AdkError } from '@holocronlab/botruntime-analytics'
import type { Agent0CatalogModel, Agent0Config, Agent0ProjectPaths } from '../types.js'
import type { Agent0OpenCodeAgentConfig, Agent0OpenCodeCommandConfig } from '../capabilities/builtins.js'
import { buildAgent0BuiltInCapabilities } from '../capabilities/builtins.js'
import { getAgent0ProviderCatalogEntry } from '../providers/catalog.js'
import { buildAgent0OpenCodePermissionConfig, type Agent0OpenCodePermissionConfig } from './permissions.js'
import { AGENT0_PROJECT_ID_CACHE_GUARD_ENV, ensureAgent0ProjectDiscoveryGitShim } from './project-discovery.js'

export interface Agent0OpenCodeApiAuth {
  type: 'api'
  key: string
}

export type Agent0OpenCodeAuthContent = Record<string, Agent0OpenCodeApiAuth>

export interface Agent0OpenCodeProviderConfig {
  api?: string
  name?: string
  options?: {
    apiKey?: string
    baseURL?: string
  }
  models?: Record<
    string,
    {
      id?: string
      name: string
      cost?: { input: number; output: number }
      limit?: { context: number; output: number }
      // OpenCode gates whether tool-result images are sent to the model on
      // these. Without them a vision-capable model is treated as text-only,
      // so `adk_take_screenshot` output is silently dropped before it reaches
      // the model. Derived from the cognitive catalog's `vision` tag.
      attachment?: boolean
      modalities?: {
        input: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>
        output: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>
      }
    }
  >
}

export interface Agent0OpenCodeConfig {
  server?: {
    port: number
    cors?: string[]
  }
  enabled_providers?: string[]
  provider?: Record<string, Agent0OpenCodeProviderConfig>
  mcp: Record<
    string,
    {
      type: 'remote'
      url: string
      oauth?: false
    }
  >
  permission: Agent0OpenCodePermissionConfig
  default_agent: string
  agent: Record<string, Agent0OpenCodeAgentConfig>
  command?: Record<string, Agent0OpenCodeCommandConfig>
  plugin: []
  skills: {
    paths: string[]
    urls: []
  }
  instructions: string[]
  share: 'disabled'
  autoupdate: false
}

export interface Agent0OpenCodeRuntimeRenderOptions {
  paths: Agent0ProjectPaths
  adkDevConsolePort: number
  agentPath: string
  agent0Config?: Agent0Config
  cognitiveModels?: Agent0CatalogModel[]
  openCodePort?: number
  corsOrigins?: string[]
}

export interface Agent0OpenCodeRuntimeRenderResult {
  config: Agent0OpenCodeConfig
  authContent: Agent0OpenCodeAuthContent
  renderedOpenCodeConfigHash: string
  env: Record<string, string>
}

export function buildAgent0OpenCodeAuthContent(config: Agent0Config): Agent0OpenCodeAuthContent {
  return Object.fromEntries(
    getAgent0OpenCodeAuthenticatedProviders(config).map(([providerId, connection]) => [
      providerId,
      { type: 'api', key: connection.auth.apiKey } satisfies Agent0OpenCodeApiAuth,
    ])
  )
}

export function buildAgent0OpenCodeConfig(options: Agent0OpenCodeRuntimeRenderOptions): Agent0OpenCodeConfig {
  const builtIns = buildAgent0BuiltInCapabilities({
    adkDevConsolePort: options.adkDevConsolePort,
    agentPath: options.agentPath,
  })
  const authenticatedProviders = options.agent0Config
    ? getAgent0OpenCodeAuthenticatedProviders(options.agent0Config)
    : []
  const externalProviderConfig = Object.fromEntries(
    authenticatedProviders.flatMap(([providerId, connection]) =>
      connection.auth.baseURL ? [[providerId, { options: { baseURL: connection.auth.baseURL } }]] : []
    )
  )
  const provider: Record<string, Agent0OpenCodeProviderConfig> = {
    ...externalProviderConfig,
    ...(options.cognitiveModels === undefined ? {} : { cognitive: buildAgent0CognitiveProvider(options) }),
  }
  const enabledProviders = [
    ...(options.cognitiveModels === undefined ? [] : ['cognitive']),
    ...authenticatedProviders.map(([providerId]) => providerId),
  ]

  return {
    ...(options.openCodePort
      ? {
          server: {
            port: options.openCodePort,
            ...(options.corsOrigins?.length ? { cors: [...options.corsOrigins] } : {}),
          },
        }
      : {}),
    ...(options.agent0Config || options.cognitiveModels !== undefined ? { enabled_providers: enabledProviders } : {}),
    ...(Object.keys(provider).length ? { provider } : {}),
    mcp: builtIns.mcp,
    permission: buildAgent0OpenCodePermissionConfig(),
    default_agent: builtIns.defaultAgent,
    agent: builtIns.agent,
    ...(Object.keys(builtIns.command).length ? { command: builtIns.command } : {}),
    plugin: [],
    skills: builtIns.skills,
    instructions: builtIns.instructions,
    share: 'disabled',
    autoupdate: false,
  }
}

export function buildAgent0CognitiveProvider(
  options: Pick<Agent0OpenCodeRuntimeRenderOptions, 'adkDevConsolePort' | 'agentPath' | 'cognitiveModels'>
): Agent0OpenCodeProviderConfig {
  const baseURL = `http://localhost:${options.adkDevConsolePort}/api/agent-proxy/${encodeURIComponent(options.agentPath)}/api/cognitive/v1`
  const models = Object.fromEntries(
    (options.cognitiveModels ?? [])
      .filter((model) => model.providerId === 'cognitive')
      .map((model) => [
        model.modelId,
        {
          id: model.modelId,
          name: model.name,
          ...renderCognitiveModelCostAndLimits(model),
          ...renderCognitiveModelModalities(model),
        },
      ])
  )

  return {
    api: 'openai-completions',
    name: 'Holocron Cognitive',
    options: { apiKey: 'cognitive', baseURL },
    models,
  }
}

export function buildAgent0OpenCodeEnv(
  paths: Agent0ProjectPaths,
  configOrContent: Agent0OpenCodeConfig | string,
  authContent: Agent0OpenCodeAuthContent = {}
): Record<string, string> {
  const configContent = typeof configOrContent === 'string' ? configOrContent : JSON.stringify(configOrContent)
  return {
    XDG_CONFIG_HOME: paths.xdgConfigHome,
    XDG_DATA_HOME: paths.xdgDataHome,
    XDG_CACHE_HOME: paths.xdgCacheHome,
    XDG_STATE_HOME: paths.xdgStateHome,
    OPENCODE_CONFIG_DIR: paths.engineConfigDir,
    OPENCODE_CONFIG_CONTENT: configContent,
    OPENCODE_AUTH_CONTENT: JSON.stringify(authContent),
    OPENCODE_TEST_HOME: paths.fakeHomeDir,
    OPENCODE_PURE: '1',
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
    OPENCODE_DISABLE_DEFAULT_PLUGINS: '1',
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: '1',
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_SHARE: '1',
    [AGENT0_PROJECT_ID_CACHE_GUARD_ENV]: '1',
    PATH: '',
  }
}

export function renderAgent0OpenCodeRuntime(
  options: Agent0OpenCodeRuntimeRenderOptions
): Agent0OpenCodeRuntimeRenderResult {
  const config = buildAgent0OpenCodeConfig(options)
  const configContent = JSON.stringify(config)
  const authContent = options.agent0Config ? buildAgent0OpenCodeAuthContent(options.agent0Config) : {}
  return {
    config,
    authContent,
    renderedOpenCodeConfigHash: sha256(configContent),
    env: buildAgent0OpenCodeEnv(options.paths, configContent, authContent),
  }
}

export async function prepareAgent0OpenCodeRuntime(
  options: Agent0OpenCodeRuntimeRenderOptions
): Promise<Agent0OpenCodeRuntimeRenderResult> {
  await ensureAgent0ProjectDiscoveryGitShim(options.paths)
  return renderAgent0OpenCodeRuntime(options)
}

function getAgent0OpenCodeAuthenticatedProviders(config: Agent0Config) {
  return Object.entries(config.providers)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, connection]) => {
      if (!connection.enabled || connection.auth?.type !== 'api_key') return []

      const entry = getAgent0ProviderCatalogEntry(connection.providerId)
      if (!entry)
        throw new AdkError({
          code: 'AGENT0_PROVIDER_UNKNOWN',
          message: `Unknown Agent(0) provider: ${connection.providerId}`,
          expected: false,
        })
      if (entry.firstParty || entry.auth.type !== 'api_key') return []

      const providerId =
        entry.modelSource?.type === 'models.dev' ? (entry.modelSource.providerId ?? entry.id) : undefined
      if (!providerId)
        throw new AdkError({
          code: 'AGENT0_PROVIDER_SOURCE_MISSING',
          message: `Agent(0) provider ${connection.providerId} has no OpenCode provider source`,
          expected: false,
        })

      return [[providerId, { ...connection, auth: connection.auth }] as const]
    })
}

function renderCognitiveModelCostAndLimits(model: Agent0CatalogModel) {
  if (
    model.inputCostPer1MTokens === undefined &&
    model.outputCostPer1MTokens === undefined &&
    model.contextWindow === undefined &&
    model.outputLimit === undefined
  ) {
    return {}
  }

  return {
    cost: {
      input: model.inputCostPer1MTokens ?? 0,
      output: model.outputCostPer1MTokens ?? 0,
    },
    limit: {
      context: model.contextWindow ?? 0,
      output: model.outputLimit ?? 0,
    },
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Declare image support to OpenCode for vision-capable cognitive models.
 *
 * OpenCode only forwards tool-result images (e.g. from `adk_take_screenshot`)
 * to a model whose config marks it as accepting image input. The Botpress
 * cognitive catalog tags such models `vision`; surface that as OpenCode's
 * `attachment` + `modalities`. Non-vision models are left text-only so we
 * never send an image a model would reject.
 */
function renderCognitiveModelModalities(model: Agent0CatalogModel): {
  attachment?: boolean
  modalities?: {
    input: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>
    output: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>
  }
} {
  if (!model.tags?.includes('vision')) return {}

  return {
    attachment: true,
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
  }
}
