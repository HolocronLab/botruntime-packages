import { BaseWorkflow } from '../../primitives/workflow'
import { z } from '@holocronlab/botruntime-sdk'
import { context } from '../context/context'
import type {
  EvalDefinition,
  EvalManifest,
  EvalRunnerConfig,
  EvalRunReport,
} from '@holocronlab/botruntime-evals'
import {
  EVAL_MANIFEST_TAGS,
  EVAL_MANIFEST_SCHEMA_VERSION,
  createNativeEvalChatClient,
} from '@holocronlab/botruntime-evals'
import {
  runEvalSuite,
  validateEvalCapabilities,
  validateEvalControlCapabilities,
} from '@holocronlab/botruntime-evals/runner'
import { filterEvals } from '@holocronlab/botruntime-evals/loader'
import {
  VortexEvalStore,
  validateHostedEvalDefinitions,
} from '@holocronlab/botruntime-evals/stores/vortex'
import { LocalSpanSource, VortexSpanSource, type SpanSource } from '@holocronlab/botruntime-evals/spans'
import { Client } from '@holocronlab/botruntime-client'
import { resolveEvalExecutionEnvironment } from './eval-environment'
import { HostedEvalLifecycle } from './hosted-eval-lifecycle'
import { createHostedFixtureResolver } from './eval-fixtures'
import { PlatformEvalControl } from './eval-control'
import { fetchEvalManifestFile } from './eval-file-fetch'
import {
  assertHostedEvalExecutionActive,
  assertHostedEvalInvocationBudget,
  assertHostedEvalStartBudget,
  resolveHostedEvalIdleTimeout,
} from './eval-runner-policy'

async function loadEvalManifest(client: Client): Promise<{
  evals: EvalDefinition[]
  fileId: string | undefined
  chatWebhookId: string | undefined
  fixtures: NonNullable<EvalManifest['fixtures']>
}> {
  const { files } = await client.listFiles({ tags: EVAL_MANIFEST_TAGS })

  if (files.length === 0) {
    return { evals: [], fileId: undefined, chatWebhookId: undefined, fixtures: {} }
  }

  const file = files[0]!
  const res = await fetchEvalManifestFile(file.url, client)
  if (!res.ok) {
    throw new Error(`Failed to fetch eval manifest: ${res.status}`)
  }

  const manifest = (await res.json()) as EvalManifest

  if (manifest.schemaVersion !== EVAL_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Eval manifest schema version ${manifest.schemaVersion} is not supported (expected ${EVAL_MANIFEST_SCHEMA_VERSION}). Redeploy the bot to update the manifest.`,
    )
  }

  return {
    evals: manifest.evals,
    fileId: manifest.manifestId ?? file.id,
    chatWebhookId: manifest.chatWebhookId,
    fixtures: manifest.fixtures ?? {},
  }
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
    evalManifestId: z.string().optional(),
    idleTimeout: z.number().optional(),
    /** @deprecated Compatibility no-op: the LLM judge returns a boolean verdict, not a score. */
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
    assertHostedEvalInvocationBudget(context.get('runtime').getRemainingExecutionTimeInMs())
    const runtimeClient = client._inner

    const { apiUrl, token, runtimeBotId, apiBotId, workspaceId, development } =
      resolveEvalExecutionEnvironment(process.env, context.get('botId'))
    const botId = apiBotId
    const sdkClient: Client = development
      ? new Client({ apiUrl, token, botId: apiBotId, workspaceId })
      : (runtimeClient as unknown as Client)
    // Dev callback routing is attested by the opaque runtime id. Adding the
    // workspace header would switch PAT auth to the numeric deploy path and
    // incorrectly interpret the runtime id as an API bot id. Empty workspaceId
    // deliberately suppresses the SDK's BP_WORKSPACE_ID environment fallback.
    const chatSdkClient: Client = development
      ? new Client({ apiUrl, token, botId: runtimeBotId, workspaceId: '' })
      : (runtimeClient as unknown as Client)
    // File dependencies can cause Bun to materialize the same client package
    // twice while developing the monorepo. The public Client contract is the
    // same; erase only that duplicate nominal identity at the eval boundary.
    const evalSdkClient = sdkClient as unknown as EvalRunnerConfig['client']
    const evalChatSdkClient = chatSdkClient as unknown as EvalRunnerConfig['client']
    const chatClient = createNativeEvalChatClient(evalChatSdkClient)
    const vortexUrl = apiUrl

    const {
      evals: definitions,
      fileId: loadedManifestId,
      fixtures,
    } = await step('load-manifest', () => loadEvalManifest(sdkClient))

    if (definitions.length === 0) {
      throw new Error(
        'No eval manifest found. Upload eval definitions via the files API before running the eval workflow.',
      )
    }

    if (input.evalManifestId && loadedManifestId && input.evalManifestId !== loadedManifestId) {
      throw new Error('The synchronized eval manifest does not match the loaded eval manifest.')
    }
    const evalManifestId = input.evalManifestId ?? loadedManifestId

    const filter = input.filter
      ? {
          ...(input.filter.names ? { names: input.filter.names } : {}),
          ...(input.filter.tags ? { tags: input.filter.tags } : {}),
          ...(input.filter.type ? { type: input.filter.type } : {}),
        }
      : undefined

    const filteredDefinitions = filterEvals(definitions, filter)
    if (filteredDefinitions.length === 0) {
      throw new Error('No eval definitions matched the requested filter.')
    }
    validateHostedEvalDefinitions(filteredDefinitions)
    const evalControl = development
      ? new PlatformEvalControl({ apiUrl, token, runtimeBotId, workspaceId: workspaceId! })
      : undefined
    validateEvalControlCapabilities(filteredDefinitions, evalControl)

    const localSpanIngestUrl = process.env.ADK_SPAN_INGEST_URL
    if (development && !localSpanIngestUrl) {
      throw new Error('Hosted development evals require the brt dev local span ingest server.')
    }

    const createSpanSource = (): SpanSource =>
      development
        ? new LocalSpanSource(localSpanIngestUrl!)
        : new VortexSpanSource({
            mode: 'bot',
            url: vortexUrl,
            token,
            development: false,
          })

    await step('preflight-eval-reader', async () => {
      const source = createSpanSource()
      try {
        validateEvalCapabilities(filteredDefinitions, source.capabilities)
        await source.assertReadable?.()
      } finally {
        source.disconnect()
      }
    })

    const evalStore = new VortexEvalStore({
      url: vortexUrl,
      token,
      development,
      ...(evalManifestId ? { evalManifestId } : {}),
      // Eval API routes are keyed by the callback/runtime identity. The
      // numeric apiBotId above is only for tenant storage/admin SDK calls.
      botId: runtimeBotId,
    })

    // Create the Vortex run BEFORE running the suite so it is visible and
    // trackable for its entire lifetime (pending → running → completed).
    // The dev console's watchRun polls for the bot's latest run; if the run
    // only appeared at the very end, watchRun would report the PREVIOUS run
    // instead — surfacing stale or mismatched results in the runner view.
    const vortexRunId = await step('create-run', () =>
      evalStore.createRun(input.runType ?? 'scheduled', {
        workflowId: workflow.id,
        definitions: filteredDefinitions,
      }),
    )

    const hostedLifecycle = new HostedEvalLifecycle(
      evalStore,
      vortexRunId,
      filteredDefinitions,
      signal,
    )

    const config: EvalRunnerConfig = {
      client: evalSdkClient,
      botId,
      definitions: filteredDefinitions,
      chatClient,
      ...(Object.keys(fixtures).length > 0
        ? { resolveFixture: createHostedFixtureResolver(fixtures, sdkClient) }
        : {}),
      ...(evalControl ? { evalControl } : {}),
      createSpanSource,
      sourcePreflighted: true,
      evalOptions: {
        idleTimeout: resolveHostedEvalIdleTimeout(input.idleTimeout),
        ...(input.judgePassThreshold !== undefined
          ? { judgePassThreshold: input.judgePassThreshold }
          : {}),
        ...(input.judgeModel !== undefined
          ? { judgeModel: input.judgeModel }
          : {}),
      },
      // Ingest into Vortex as the suite runs so the dev console can stream live
      // progress. Failures are never swallowed: the final reconciliation can
      // replay identical writes, while the outer lifecycle safely terminalizes
      // an execution that cannot be reconciled.
      onProgress: (event) => hostedLifecycle.onProgress(event),
      checkpointEval: async ({ definition, index, execute }) => {
        assertHostedEvalStartBudget(context.get('runtime').getRemainingExecutionTimeInMs())
        const report = await step(`run-eval-${index}-${definition.name}`, execute)
        hostedLifecycle.rememberCompletedReport(report)
        return report
      },
      signal,
    }

    let report: EvalRunReport
    try {
      report = await runEvalSuite(config)
      assertHostedEvalExecutionActive(signal)
    } catch (error) {
      assertHostedEvalExecutionActive(signal)
      return hostedLifecycle.terminalizeFailure(error, step)
    }

    try {
      await hostedLifecycle.reconcileForCompletion(report, step)
      assertHostedEvalExecutionActive(signal)
    } catch (error) {
      assertHostedEvalExecutionActive(signal)
      return hostedLifecycle.terminalizeFailure(error, step)
    }

    const completion = hostedLifecycle.completionOf(report)
    // Keep completion outside the failure-reclassification catch. A network
    // error here is ambiguous (the server may already be terminal); retrying
    // with a different terminal verdict could create a divergent 409.
    await step('complete-run', () =>
      evalStore.markRunComplete(vortexRunId, completion),
    )

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
