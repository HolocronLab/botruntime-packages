import { AgentProject } from '../agent-project/agent-project.js'
import { ADK_VERSION, formatCode } from './utils.js'
import { createFile } from '../utils/fs.js'
import path from 'path'

/**
 * Check if an event schema has a conversationId property.
 * Events with conversationId can be routed to conversations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema is a dynamic Zod object
function hasConversationIdProperty(schema: any): boolean {
  if (!schema || typeof schema !== 'object') {
    return false
  }

  // Check direct properties
  if (schema.properties && 'conversationId' in schema.properties) {
    return true
  }

  // Check allOf, anyOf, oneOf
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(schema[key])) {
      for (const subSchema of schema[key]) {
        if (hasConversationIdProperty(subSchema)) {
          return true
        }
      }
    }
  }

  return false
}

export async function generateConversationTypes(project: AgentProject): Promise<void> {
  // Map conversation definitions to their channel types
  const conversationTypes: Record<string, { channel: string | string[]; state: string }> = {}

  for (const conversationRef of project.conversations) {
    try {
      const conversationPath = path.join(project.path, conversationRef.path)
      // Bust module cache to ensure fresh conversation on type generation
      const conversationModule = await import(`${conversationPath}?t=${Date.now()}`)

      const conversationInstance = conversationModule[conversationRef.export] || conversationModule.default

      if (!conversationInstance) {
        continue
      }

      // Get the channel specification
      const channel = conversationInstance.channel

      // Extract state schema and convert to TypeScript type
      const stateType = conversationInstance.schema
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK schema method not in type definitions
          (conversationInstance.schema as any).toTypescriptType?.() || 'any'
        : '{}'

      // Determine the channel key(s)
      let channels: string[]
      if (channel === '*') {
        // Glob - we'll need to handle this specially
        channels = ['*']
      } else if (Array.isArray(channel)) {
        channels = channel as string[]
      } else {
        channels = [channel as string]
      }

      // Store conversation info for each channel
      for (const ch of channels) {
        conversationTypes[ch] = {
          channel: ch,
          state: stateType,
        }
      }
    } catch (error) {
      console.error(`Failed to process conversation ${conversationRef.export}:`, error)
    }
  }

  // Build a map of integration alias -> array of routable event names (in format "integration:eventName")
  const routableEventsByIntegration: Record<string, string[]> = {}

  for (const int of project.integrations) {
    if (!int.definition?.events) continue

    const routableEvents: string[] = []
    for (const [eventName, event] of Object.entries(int.definition.events)) {
      if (hasConversationIdProperty(event.schema)) {
        // Use format "integration:eventName" for event routing
        routableEvents.push(`${int.alias}:${eventName}`)
      }
    }

    if (routableEvents.length > 0) {
      routableEventsByIntegration[int.alias] = routableEvents
    }
  }

  // Generate type definitions for each channel
  const channelDefinitions = Object.entries(conversationTypes)
    .filter(([channel]) => channel !== '*') // Filter out glob for now
    .map(([channel, info]) => {
      const [integration, channelName] = channel.split('.')
      const hasComponents = project.customComponents.length > 0 && integration === 'webchat'
      const messagesType = hasComponents
        ? `Integrations["${integration}"]["channels"]["${channelName}"]["messages"] & { "customComponent": import("@holocronlab/botruntime-runtime/_types/components").CustomComponentMessage }`
        : `Integrations["${integration}"]["channels"]["${channelName}"]["messages"]`

      return `    "${channel}": {
      channel: "${channel}";
      integration: "${integration}";
      state: ${info.state};
      tags: Integrations["${integration}"]["channels"]["${channelName}"]["conversation"]["tags"] & ConversationTags;
      messageTags: Integrations["${integration}"]["channels"]["${channelName}"]["message"]["tags"] & MessageTags;
      messages: ${messagesType};
      events: Integrations["${integration}"]["events"];
    };`
    })
    .join('\n')

  // Generate ConversationRoutableEvents type
  // This maps each channel to an array of event names that have conversationId
  const routableEventsDefinitions = Object.entries(conversationTypes)
    .filter(([channel]) => channel !== '*')
    .map(([channel]) => {
      const [integration] = channel.split('.') as [string, ...string[]]
      const events = routableEventsByIntegration[integration] || []
      const eventsTuple =
        events.length > 0 ? `readonly [${events.map((e: string) => `"${e}"`).join(', ')}]` : 'readonly []'
      return `    "${channel}": ${eventsTuple};`
    })
    .join('\n')

  const content = `
////////////////////////////////////////////////////////
// DO NOT EDIT THIS FILE DIRECTLY
// This file is auto-generated from the Botpress ADK
// ADK Version: ${ADK_VERSION}
// Generated at: ${new Date().toISOString()}
////////////////////////////////////////////////////////

type Integrations = import("@holocronlab/botruntime-runtime/_types/integrations").Integrations;
type ConversationTags = import("@holocronlab/botruntime-runtime/_types/tags").ConversationTags;
type MessageTags = import("@holocronlab/botruntime-runtime/_types/tags").MessageTags;

declare module "@holocronlab/botruntime-runtime/_types/conversations" {
  export type ConversationDefinitions = {
${channelDefinitions || '    // No conversations defined yet'}
  };

  /**
   * Events that can be routed to conversations (events with conversationId property).
   * Keyed by channel, containing a tuple of event names that have conversationId.
   */
  export type ConversationRoutableEvents = {
${routableEventsDefinitions || '    // No routable events found'}
  };
}
`

  // Write to conversation-types.d.ts in the .adk folder
  const conversationTypesPath = path.join(project.path, '.adk', 'conversation-types.d.ts')
  await createFile(conversationTypesPath, await formatCode(content))
}
