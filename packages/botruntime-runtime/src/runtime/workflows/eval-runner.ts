import { BaseWorkflow } from '../../primitives/workflow'
import { z } from '@holocronlab/botruntime-sdk'
import { context } from '../context/context'
import type { EvalDefinition, EvalManifest, EvalRunnerConfig } from '@holocronlab/botruntime-evals'
import { EVAL_MANIFEST_TAGS, EVAL_MANIFEST_SCHEMA_VERSION } from '@holocronlab/botruntime-evals'
import { runEvalSuite } from '@holocronlab/botruntime-evals/runner'
import { VortexEvalStore } from '@holocronlab/botruntime-evals/stores/vortex'
import { VortexSpanSource } from '@holocronlab/botruntime-evals/spans'
import type { Client } from '@holocronlab/botruntime-client'

async function loadEvalManifest(
  client: Client
): Promise<{ evals: EvalDefinition[]; fileId: string | undefined; chatWebhookId: string | undefined }> {
  const { files } = await client.listFiles({ tags: EVAL_MANIFEST_TAGS })

  if (files.length === 0) {
    return { evals: [], fileId: undefined, chatWebhookId: undefined }
  }

  const file = files[0]!
  const res = await fetch(file.url)
  if (!res.ok) {
    throw new Error(`Failed to fetch eval manifest: ${res.status}`)
  }

  const manifest = (await res.json()) as EvalManifest

  if (manifest.schemaVersion !== EVAL_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Eval manifest schema version ${manifest.schemaVersion} is not supported (expected ${EVAL_MANIFEST_SCHEMA_VERSION}). Redeploy the bot to update the manifest.`
    )
  }

  return { evals: manifest.evals, fileId: file.id, chatWebhookId: manifest.chatWebhookId }
}

export const EvalRunnerWorkflow = new BaseWorkflow({
  name: 'builtin_eval_runner' as const,
  description: 'Built-in workflow to run scheduled eval suites against the bot',

  input: z.object({
    filter: z
      .object({
        names: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        type: z.enum(['capability', 'regression']).optional(),
      })
      .optional(),
    runType: z.enum(['scheduled', 'manual']).optional().default('scheduled'),
    idleTimeout: z.number().optional(),
    judgePassThreshold: z.number().optional(),
    judgeModel: z.string().optional(),
  }),

  output: z.object({
    runId: z.string(),
    passed: z.number(),
    failed: z.number(),
    total: z.number(),
    duration: z.number(),
    aborted: z.boolean().optional(),
  }),

  timeout: '60m',

  handler: async ({ input, step, signal, workflow, client }) => {
    const sdkClient = client._inner
    const chatModule = (await import(/* webpackIgnore: true */ '@holocronlab/botruntime-chat' as string)) as {
      Client?: import('@holocronlab/botruntime-evals').ChatClient
      default?: { Client?: import('@holocronlab/botruntime-evals').ChatClient }
    }
    const chatClient = chatModule.default?.Client ?? chatModule.Client

    if (!chatClient) {
      throw new Error('Chat client is required to run evals.')
    }

    const botId = context.get('botId')
    const apiUrl = process.env.BP_API_URL
    const token = process.env.BP_TOKEN || process.env.ADK_TOKEN
    const workspaceId = process.env.BP_WORKSPACE_ID || process.env.ADK_WORKSPACE_ID

    if (!apiUrl) {
      throw new Error('BP_API_URL is required to run production evals.')
    }

    const vortexUrl = apiUrl.replace(/\/+$/, '')
    const chatBaseUrl = apiUrl.replace(/\/+$/, '').replace('://api.', '://chat.')

    const {
      evals: definitions,
      fileId: evalManifestId,
      chatWebhookId,
    } = await step('load-manifest', () => loadEvalManifest(sdkClient))

    if (definitions.length === 0) {
      throw new Error(
        'No eval manifest found. Upload eval definitions via the files API before running the eval workflow.'
      )
    }

    const filter = input.filter
      ? {
          ...(input.filter.names ? { names: input.filter.names } : {}),
          ...(input.filter.tags ? { tags: input.filter.tags } : {}),
          ...(input.filter.type ? { type: input.filter.type } : {}),
        }
      : undefined

    const evalStore = new VortexEvalStore({
      url: vortexUrl,
      ...(workspaceId ? { workspaceId } : {}),
      ...(token ? { token } : {}),
      ...(evalManifestId ? { evalManifestId } : {}),
      botId,
    })

    // Create the Vortex run BEFORE running the suite so it is visible and
    // trackable for its entire lifetime (pending → running → completed).
    // The dev console's watchRun polls for the bot's latest run; if the run
    // only appeared at the very end, watchRun would report the PREVIOUS run
    // instead — surfacing stale or mismatched results in the runner view.
    const vortexRunId = await step('create-run', () =>
      evalStore.createRun(input.runType ?? 'scheduled', { workflowId: workflow.id })
    )

    // Builds each entry up as the suite runs (start → append per turn → finalize)
    // via the dedicated lifecycle endpoints, so the dev console can stream
    // turn-by-turn progress. Requires the matching Vortex endpoints.
    const entryIds = new Map<string, string>() // evalName → server entry id

    const config: EvalRunnerConfig = {
      client: sdkClient,
      botId,
      definitions,
      chatClient,
      ...(chatWebhookId ? { chatWebhookId } : {}),
      chatBaseUrl,
      createSpanSource: () =>
        new VortexSpanSource({
          url: vortexUrl,
          ...(workspaceId ? { workspaceId } : {}),
          ...(token ? { token } : {}),
          botId,
        }),
      evalOptions: {
        idleTimeout: input.idleTimeout ?? 300_000,
        ...(input.judgePassThreshold !== undefined ? { judgePassThreshold: input.judgePassThreshold } : {}),
        ...(input.judgeModel !== undefined ? { judgeModel: input.judgeModel } : {}),
      },
      // Ingest into Vortex as the suite runs so the dev console can stream live
      // progress. Best-effort: a transient ingest failure for one event is
      // logged, not thrown, so it can't abort the whole suite (the entry/turn is
      // simply absent until the next run).
      onProgress: async (event) => {
        try {
          if (event.type === 'eval_start') {
            const def = definitions.find((d) => d.name === event.evalName)
            const entryId = await evalStore.startEntry(vortexRunId, {
              evalName: event.evalName,
              ...(def?.type ? { evalType: def.type } : {}),
              ...(def?.description ? { description: def.description } : {}),
              ...(def?.tags ? { tags: def.tags } : {}),
            })
            entryIds.set(event.evalName, entryId)
          } else if (event.type === 'turn_complete') {
            const entryId = entryIds.get(event.evalName)
            if (entryId) await evalStore.appendTurnResults(vortexRunId, entryId, event.turnReport)
          } else if (event.type === 'eval_complete') {
            const entryId = entryIds.get(event.evalName)
            if (entryId) {
              await evalStore.appendOutcomeResults(vortexRunId, entryId, event.report.outcomeAssertions)
              await evalStore.finalizeEntry(vortexRunId, entryId, {
                passed: event.report.pass,
                durationMs: event.report.duration,
                ...(event.report.error !== undefined ? { error: event.report.error } : {}),
              })
            }
          }
        } catch (err) {
          console.error('[eval-runner] live ingest failed', {
            type: event.type,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      },
      signal,
    }

    const report = await step('run-evals', () => runEvalSuite(config, filter))

    // Entries were started/appended/finalized incrementally via onProgress;
    // flip the run to its terminal status via the dedicated /complete endpoint.
    const hasRunError = report.aborted === true || report.evals.some((e) => e.error !== undefined)
    await step('complete-run', () => evalStore.markRunComplete(vortexRunId, { failed: hasRunError }))

    return {
      runId: vortexRunId,
      passed: report.passed,
      failed: report.failed,
      total: report.total,
      duration: report.duration,
      ...(report.aborted ? { aborted: true } : {}),
    }
  },
})
