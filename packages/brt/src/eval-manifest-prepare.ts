import type { Client } from '@holocronlab/botruntime-client'
import { loadEvalsFromDir } from '@holocronlab/botruntime-evals/loader'
import { syncEvalManifest } from './eval-manifest-sync'

export async function prepareHostedEvalManifest(input: {
  projectDir: string
  botId: string
  workspaceId: string
  chatWebhookId: string
  client: Client
}): Promise<{ manifestFileId: string; fixtures: number; evals: number }> {
  const definitions = await loadEvalsFromDir(`${input.projectDir}/evals`)
  if (definitions.length === 0) {
    throw new Error(`No eval definitions found in ${input.projectDir}/evals.`)
  }
  return syncEvalManifest({
    projectDir: input.projectDir,
    chatWebhookId: input.chatWebhookId,
    definitions,
    client: input.client,
  })
}
