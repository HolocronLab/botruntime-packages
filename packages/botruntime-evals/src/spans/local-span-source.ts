import type { SpanSource, TurnWaitOptions, WaitOptions, WorkflowWaitOptions } from './span-source'
import type { Span } from './trace'
import { SSECollector } from './sse-collector'

export class LocalSpanSource implements SpanSource {
  private collector: SSECollector

  constructor(devServerUrl: string, headers: Record<string, string> = {}) {
    this.collector = new SSECollector(devServerUrl, headers)
  }

  async connect(filter: { conversationId: string }): Promise<void> {
    await this.collector.connect(filter)
  }

  async repoint(filter: { conversationId: string }): Promise<void> {
    await this.collector.repoint(filter)
  }

  startTurn(): void {
    this.collector.startTurn()
  }

  async waitForTurnComplete(opts: TurnWaitOptions): Promise<void> {
    await this.collector.waitForTurnComplete(opts)
  }

  async waitForWorkflow(name: string, opts: WorkflowWaitOptions): Promise<void> {
    await this.collector.waitForWorkflow(name, opts)
  }

  getTurnSpans(): Span[] {
    return this.collector.getTurnSpans()
  }

  getAllSpans(): Span[] {
    return this.collector.getAllSpans()
  }

  disconnect(): void {
    this.collector.disconnect()
  }
}
