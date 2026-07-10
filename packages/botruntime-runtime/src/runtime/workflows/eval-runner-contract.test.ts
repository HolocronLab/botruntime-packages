import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('runtime eval workflow trace-reader contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'eval-runner.ts'), 'utf8')

  it('uses bot-scoped reader authority and never the human admin target route', () => {
    expect(source).toContain("mode: 'bot'")
    expect(source).toContain('development: true')
    expect(source).toContain('runtimeBotId')
    expect(source).not.toMatch(/\btargetBotId\b/)
    expect(source).not.toMatch(/\bpat\b/)
  })

  it('filters and preflights capabilities/auth before creating a Vortex run', () => {
    const filter = source.indexOf('const filteredDefinitions = filterEvals')
    const hostedValidation = source.indexOf('validateHostedEvalDefinitions(filteredDefinitions)')
    const preflight = source.indexOf("step('preflight-eval-reader'")
    const validate = source.indexOf('validateEvalCapabilities(filteredDefinitions')
    const readable = source.indexOf('await source.assertReadable()')
    const createRun = source.indexOf("step('create-run'")

    expect(filter).toBeGreaterThan(-1)
    expect(hostedValidation).toBeGreaterThan(filter)
    expect(preflight).toBeGreaterThan(hostedValidation)
    expect(preflight).toBeGreaterThan(filter)
    expect(validate).toBeGreaterThan(preflight)
    expect(readable).toBeGreaterThan(validate)
    expect(createRun).toBeGreaterThan(readable)
    expect(source.match(/await source\.assertReadable\(\)/g)).toHaveLength(1)
    expect(source).toContain('sourcePreflighted: true')
  })

  it('uses the strict hosted write lifecycle without workspace/body authority or swallowed gaps', () => {
    const createRun = source.indexOf("step('create-run'")
    const reconcile = source.indexOf('hostedLifecycle.reconcileForCompletion')
    const complete = source.indexOf("step('complete-run'")

    expect(source).toContain('workflowId: workflow.id')
    expect(source).toContain('definitions: filteredDefinitions')
    expect(source).not.toMatch(/\bworkspaceId\b/)
    expect(source).not.toContain('live ingest failed')
    expect(reconcile).toBeGreaterThan(createRun)
    expect(complete).toBeGreaterThan(reconcile)
  })
})
