import { z } from '@holocronlab/botruntime-sdk'
import type { AgentConfig, PrimitiveReference, ToolReference } from '../agent-project/index.js'
import { serializeSchema } from '../utils/schema-serialization.js'

export const DEPLOYED_AGENT_MANIFEST_SCHEMA_VERSION = 1
export const DEPLOYED_AGENT_MANIFEST_FILE_KEY = '.adk/deployed-agent-manifest.json'

export const ADK_MANIFEST_BOT_TAGS = {
  adkManifestVersion: String(DEPLOYED_AGENT_MANIFEST_SCHEMA_VERSION),
} as const

export const DEPLOYED_AGENT_MANIFEST_TAGS = {
  type: 'adk-deployed-agent-manifest',
  schemaVersion: String(DEPLOYED_AGENT_MANIFEST_SCHEMA_VERSION),
} as const

export const deployedAgentManifestPrimitiveSchema = z.object({
  definition: z.record(z.unknown()),
  source: z.object({
    path: z.string(),
    exportName: z.string(),
  }),
})

export const deployedAgentManifestSchema = z.object({
  schemaVersion: z.literal(DEPLOYED_AGENT_MANIFEST_SCHEMA_VERSION),
  generatedAt: z.string(),
  agent: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    maxExecutionTime: z.number().int().min(1).max(3600).optional(),
    configuration: z.object({ schema: z.record(z.unknown()) }).optional(),
    defaultModels: z.unknown().optional(),
    secrets: z.array(
      z.object({
        name: z.string(),
        optional: z.boolean(),
        description: z.string().optional(),
      })
    ),
    events: z.record(z.unknown()).optional(),
    tags: z.record(z.unknown()).optional(),
  }),
  primitives: z.object({
    actions: z.array(deployedAgentManifestPrimitiveSchema),
    tools: z.array(deployedAgentManifestPrimitiveSchema),
    workflows: z.array(deployedAgentManifestPrimitiveSchema),
    conversations: z.array(deployedAgentManifestPrimitiveSchema),
    triggers: z.array(deployedAgentManifestPrimitiveSchema),
    tables: z.array(deployedAgentManifestPrimitiveSchema),
    knowledge: z.array(deployedAgentManifestPrimitiveSchema),
    customComponents: z.array(deployedAgentManifestPrimitiveSchema),
  }),
})

export type DeployedAgentManifestPrimitive = z.infer<typeof deployedAgentManifestPrimitiveSchema>
export type DeployedAgentManifest = z.infer<typeof deployedAgentManifestSchema>

type ManifestRecord = Record<string, unknown>

export interface DeployedAgentManifestProject {
  config?: AgentConfig
  actions: PrimitiveReference[]
  tools: ToolReference[]
  workflows: PrimitiveReference[]
  conversations: PrimitiveReference[]
  triggers: PrimitiveReference[]
  tables: PrimitiveReference[]
  knowledge: PrimitiveReference[]
  customComponents: PrimitiveReference[]
}

export interface CreateDeployedAgentManifestOptions {
  generatedAt?: string
}

export interface DeployedAgentManifestUploadClient {
  uploadFile(input: {
    key: string
    content: string
    contentType: string
    tags: Record<string, string>
    index: boolean
  }): Promise<unknown>
}

export interface DeployedAgentBotTagClient {
  getBot(input: { id: string }): Promise<{ bot: { tags?: Record<string, string> } }>
  updateBot(input: { id: string; tags: Record<string, string> }): Promise<unknown>
}

export function createDeployedAgentManifest(
  project: DeployedAgentManifestProject,
  options: CreateDeployedAgentManifestOptions
): DeployedAgentManifest {
  const config = project.config
  const secrets = Object.entries(asRecord(config?.secrets)).map(([name, declaration]) => {
    const value = asRecord(declaration)
    return {
      name,
      optional: value.optional === true,
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
    }
  })

  return {
    schemaVersion: DEPLOYED_AGENT_MANIFEST_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    agent: {
      ...(config?.name ? { name: config.name } : {}),
      ...(config?.description ? { description: config.description } : {}),
      ...(config?.maxExecutionTime !== undefined ? { maxExecutionTime: config.maxExecutionTime } : {}),
      ...(config?.configuration?.schema
        ? { configuration: { schema: schemaToRecord(config.configuration.schema, 'Agent configuration') } }
        : {}),
      ...(config?.defaultModels ? { defaultModels: config.defaultModels } : {}),
      secrets,
      ...(config?.events ? { events: normalizeEventDefinitions(config.events) } : {}),
      ...collectConfigTags(config),
    },
    primitives: {
      actions: project.actions.map(toManifestPrimitive),
      tools: project.tools.map(toManifestPrimitive),
      workflows: project.workflows.map(toManifestPrimitive),
      conversations: project.conversations.map(toManifestPrimitive),
      triggers: project.triggers.map(toManifestPrimitive),
      tables: project.tables.map(toManifestPrimitive),
      knowledge: project.knowledge.map(toManifestPrimitive),
      customComponents: project.customComponents.map(toManifestPrimitive),
    },
  }
}

export function serializeDeployedAgentManifest(manifest: DeployedAgentManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

export async function uploadDeployedAgentManifest(
  client: DeployedAgentManifestUploadClient,
  manifest: DeployedAgentManifest
): Promise<{ key: string }> {
  const content = serializeDeployedAgentManifest(manifest)

  await client.uploadFile({
    key: DEPLOYED_AGENT_MANIFEST_FILE_KEY,
    content,
    contentType: 'application/json',
    tags: DEPLOYED_AGENT_MANIFEST_TAGS,
    index: false,
  })

  return { key: DEPLOYED_AGENT_MANIFEST_FILE_KEY }
}

export async function tagDeployedAgentManifestBot(client: DeployedAgentBotTagClient, botId: string): Promise<void> {
  const { bot } = await client.getBot({ id: botId })
  const currentTags = bot.tags ?? {}
  const hasCurrentManifestTags = Object.entries(ADK_MANIFEST_BOT_TAGS).every(
    ([key, value]) => currentTags[key] === value
  )
  if (hasCurrentManifestTags) {
    return
  }

  await client.updateBot({
    id: botId,
    tags: {
      ...currentTags,
      ...ADK_MANIFEST_BOT_TAGS,
    },
  })
}

function toManifestPrimitive(ref: PrimitiveReference | ToolReference): DeployedAgentManifestPrimitive {
  return {
    source: {
      path: ref.path,
      exportName: ref.export,
    },
    definition: normalizeDefinition(ref.definition),
  }
}

function normalizeDefinition(definition: unknown): ManifestRecord {
  if (isRecordLike(definition) && Array.isArray(definition.sources)) {
    return {
      ...definition,
      sources: definition.sources.map(normalizeKnowledgeSource),
    }
  }

  return asRecord(definition)
}

function normalizeKnowledgeSource(source: unknown): ManifestRecord {
  if (!isRecordLike(source)) {
    return asRecord(source)
  }

  const config = typeof source.getConfig === 'function' ? asRecord((source.getConfig as () => unknown)()) : {}

  return {
    id: source.id,
    type: source.type,
    config,
  }
}

function collectConfigTags(config: AgentConfig | undefined): { tags?: ManifestRecord } {
  if (!config) {
    return {}
  }

  const tags = {
    ...(config.bot?.tags ? { bot: config.bot.tags } : {}),
    ...(config.user?.tags ? { user: config.user.tags } : {}),
    ...(config.conversation?.tags ? { conversation: config.conversation.tags } : {}),
    ...(config.message?.tags ? { message: config.message.tags } : {}),
    ...(config.workflow?.tags ? { workflow: config.workflow.tags } : {}),
  }

  return Object.keys(tags).length > 0 ? { tags } : {}
}

function normalizeEventDefinitions(events: unknown): ManifestRecord {
  const normalized: ManifestRecord = {}

  for (const [name, event] of Object.entries(asRecord(events))) {
    const declaration = asRecord(event)
    normalized[name] = {
      ...(typeof declaration.description === 'string' ? { description: declaration.description } : {}),
      ...(declaration.schema ? { schema: schemaToRecord(declaration.schema, `Event "${name}"`) } : {}),
    }
  }

  return normalized
}

function schemaToRecord(schema: unknown, primitive: string): ManifestRecord {
  if (isRecordLike(schema) && typeof schema.toJSONSchema === 'function') {
    return asRecord(serializeSchema(primitive, () => (schema.toJSONSchema as () => unknown)()))
  }

  return asRecord(schema)
}

function asRecord(value: unknown): ManifestRecord {
  return isRecordLike(value) ? value : {}
}

function isRecordLike(value: unknown): value is ManifestRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
