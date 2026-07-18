import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('runtime eval workflow trace-reader contract', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, 'eval-runner.ts'),
    'utf8',
  )

  it('uses local rich traces in development and bot-scoped Vortex traces in production', () => {
    expect(source).toContain('ADK_SPAN_INGEST_URL')
    expect(source).toContain('new LocalSpanSource(localSpanIngestUrl!)')
    expect(source).toContain("mode: 'bot'")
    expect(source).toContain('apiBotId')
    expect(source).not.toMatch(/\bpat\b/)
  })

  it('uses numeric API identity only for SDK storage and opaque runtime identity for routed eval writes', () => {
    expect(source).toContain('const botId = apiBotId')
    expect(source).toMatch(/development[\s\S]*runtimeBotId/)
    expect(source).toMatch(/new VortexEvalStore\([\s\S]{0,500}botId: runtimeBotId/)
  })

  it('binds an explicitly synchronized CLI manifest to the hosted run', () => {
    expect(source).toContain('evalManifestId: z.string().optional()')
    expect(source).toContain('evalManifestFileId: z.string().optional()')
    expect(source).toContain('input.evalManifestId ?? loadedManifestId')
    expect(source).toContain('fileId: input.evalManifestFileId')
    expect(source).toContain('does not match the loaded eval manifest')
  })

  it('injects the native eval transport without importing or provisioning chat', () => {
    expect(source).toContain("new Client({ apiUrl, token, botId: runtimeBotId, workspaceId: '' })")
    expect(source).toContain('createNativeEvalChatClient(evalChatSdkClient)')
    expect(source).not.toContain("import(/* webpackIgnore: true */ '@holocronlab/botruntime-chat'")
    expect(source).not.toContain('chatWebhookId ?')
    expect(source).not.toContain('chatBaseUrl')
  })

  it('filters and preflights capabilities/auth before creating a Vortex run', () => {
    const filter = source.indexOf('const filteredDefinitions = filterEvals')
    const hostedValidation = source.indexOf(
      'validateHostedEvalDefinitions(filteredDefinitions)',
    )
    const preflight = source.indexOf("step('preflight-eval-reader'")
    const validate = source.indexOf(
      'validateEvalCapabilities(filteredDefinitions',
    )
    const readable = source.indexOf('await source.assertReadable?.()')
    const createRun = source.indexOf("step('create-run'")

    expect(filter).toBeGreaterThan(-1)
    expect(hostedValidation).toBeGreaterThan(filter)
    expect(preflight).toBeGreaterThan(hostedValidation)
    expect(preflight).toBeGreaterThan(filter)
    expect(validate).toBeGreaterThan(preflight)
    expect(readable).toBeGreaterThan(validate)
    expect(createRun).toBeGreaterThan(readable)
    expect(source.match(/await source\.assertReadable\?\.\(\)/g)).toHaveLength(1)
    expect(source).toContain('sourcePreflighted: true')
  })

  it('uses the strict hosted write lifecycle without workspace/body authority or swallowed gaps', () => {
    const createRun = source.indexOf("step('create-run'")
    const reconcile = source.indexOf('hostedLifecycle.reconcileForCompletion')
    const complete = source.indexOf("step('complete-run'")

    expect(source).toContain('workflowId: workflow.id')
    expect(source).toContain('definitions: filteredDefinitions')
    expect(source).not.toMatch(
      /new VortexEvalStore\([\s\S]{0,250}\bworkspaceId\b/,
    )
    expect(source).not.toContain('live ingest failed')
    expect(reconcile).toBeGreaterThan(createRun)
    expect(complete).toBeGreaterThan(reconcile)
  })

  it('yields on the workflow execution budget before terminalizing the hosted run', () => {
    const invocationGate = source.indexOf('assertHostedEvalInvocationBudget(')
    const manifestLoad = source.indexOf("step('load-manifest'")
    const budgetGate = source.indexOf('assertHostedEvalStartBudget(')
    const evalCheckpoint = source.indexOf('const report = await step(`run-eval-')

    expect(invocationGate).toBeGreaterThan(-1)
    expect(manifestLoad).toBeGreaterThan(invocationGate)
    expect(budgetGate).toBeGreaterThan(-1)
    expect(evalCheckpoint).toBeGreaterThan(budgetGate)
    expect(source).toMatch(
      /report = await runEvalSuite\(config\)\s+assertHostedEvalExecutionActive\(signal\)/,
    )
    expect(source).toMatch(
      /catch \(error\) \{\s+assertHostedEvalExecutionActive\(signal\)\s+return hostedLifecycle\.terminalizeFailure/,
    )
    expect(source.match(/assertHostedEvalExecutionActive\(signal\)/g)).toHaveLength(4)
  })

  it('checkpoints each eval turn inside the enclosing eval step', () => {
    const evalCheckpoint = source.indexOf('checkpointEval: async')
    const operationCheckpoint = source.indexOf('checkpointEvalOperation:')

    expect(operationCheckpoint).toBeGreaterThan(evalCheckpoint)
    expect(source).toContain("phase === 'dispatch' || phase === 'effect' || phase === 'turn' || phase === 'persist'")
    expect(source).toMatch(
      /checkpointEvalOperation:[\s\S]*?step\([\s\S]*?assertHostedEvalStartBudget\([\s\S]*?return execute\(\)/,
    )
    expect(source).toContain('runId: String(vortexRunId)')
  })

  it('rejects unsupported durable suites before creating the hosted run', () => {
    const durablePreflight = source.indexOf('validateDurableEvalDefinitions(filteredDefinitions, true)')
    const createRun = source.indexOf("step('create-run'")

    expect(durablePreflight).toBeGreaterThan(-1)
    expect(createRun).toBeGreaterThan(durablePreflight)
  })
})
