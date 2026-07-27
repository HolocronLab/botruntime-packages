import { Client } from '@holocronlab/botruntime-client'
import { Cognitive } from '@holocronlab/botruntime-cognitive'
import { BotLogger, BotSpecificClient } from '@holocronlab/botruntime-sdk'
import { agentRegistry } from './agent-registry'
import { Autonomous } from './autonomous'
import { context } from './context/context'

export type InitializeScriptContextOptions = {
  executionId: string
  botId: string
  token: string
  apiUrl: string
  workspaceId: string
  configuration: Record<string, unknown>
}

/**
 * Creates the default context for a generated one-shot script or test runtime.
 *
 * Generated projects intentionally depend only on the public runtime facade;
 * client, SDK and cognitive construction stays owned by this package so an
 * isolated workspace never has to expose transitive implementation packages.
 */
export function initializeScriptContext(options: InitializeScriptContextOptions): void {
  const vanillaClient = new Client({
    token: options.token,
    apiUrl: options.apiUrl,
    workspaceId: options.workspaceId,
    botId: options.botId,
  })
  // SDK/client generic versions are intentionally isolated behind the runtime facade.
  const client = new BotSpecificClient(vanillaClient as any)
  const cognitive = new Cognitive({ client: client as any })
  const logger = new BotLogger({})

  context.setDefaultContext({
    executionId: options.executionId,
    executionFinished: false,
    botId: options.botId,
    client: client as any,
    cognitive: cognitive as any,
    citations: new Autonomous.CitationsManager(),
    logger: logger as any,
    configuration: options.configuration,
    integrations: agentRegistry.integrations,
    interfaces: agentRegistry.interfaces,
    plugins: agentRegistry.plugins,
    states: [],
    tags: [],
    scheduledHeavyImports: new Set<string>(),
  })
}
