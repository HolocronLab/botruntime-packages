import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('workflow handler client scope', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'workflow.ts'), 'utf8')
  const contextSource = fs.readFileSync(path.resolve(__dirname, '../context/handlers.ts'), 'utf8')

  it('acknowledges processing only through the runtime scoped context client', () => {
    expect(source).not.toContain('workflow.acknowledgeStartOfProcessing()')
    expect(source).toContain("status: 'in_progress'")
    expect(source).not.toContain('void updateWorkflow({')
    expect(source).toContain('await updateWorkflow({')
    expect(contextSource).not.toContain('client: props.client as unknown as InternalClient<any>')
    expect(contextSource).toContain("context.get('client', { optional: true }) ??")
    expect(contextSource.match(/scopedClient\n/g)?.length).toBeGreaterThanOrEqual(3)
    expect(contextSource).toContain('handler({ ...props, client: scopedClient })')
  })

  it('binds action timeout advertisement to the live invocation budget', () => {
    expect(contextSource).toContain(
      'actionTimeoutMs: () => runtimeActionTimeoutMs(lambdaCtx.getRemainingTimeInMillis())'
    )
    expect(contextSource).toContain('RUNTIME_ACTION_TIMEOUT_SAFETY_MARGIN_MS')
  })
})
