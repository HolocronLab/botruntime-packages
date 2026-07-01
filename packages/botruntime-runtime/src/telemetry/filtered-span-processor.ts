import type { Context } from '@opentelemetry/api'
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'

export class FilteredSpanProcessor implements SpanProcessor {
  constructor(
    private delegate: SpanProcessor,
    private names: Set<string>
  ) {}

  onStart(span: Span, parentContext: Context): void {
    if (this.names.has(span.name)) {
      this.delegate.onStart(span, parentContext)
    }
  }

  onEnd(span: ReadableSpan): void {
    if (this.names.has(span.name)) {
      this.delegate.onEnd(span)
    }
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush()
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown()
  }
}
