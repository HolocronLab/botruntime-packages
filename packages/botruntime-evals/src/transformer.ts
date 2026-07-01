/**
 * Transformer: projects raw trace spans into grader-friendly TurnData.
 * Pure function — no side effects, no network calls.
 */

import type { Span } from './spans/trace'
import type { StateMutation, ToolCall, TurnData, WorkflowSpan } from './types'

/** Safe accessor for span.data as a string-keyed record. */
function data(span: Span): Record<string, unknown> {
  return (span.data && typeof span.data === 'object' ? span.data : {}) as Record<string, unknown>
}

/** Attempt to parse a JSON string. Returns parsed result, raw value on parse failure, or fallback if value is nullish. */
function tryParseJson(value: unknown): unknown {
  if (value == null) return undefined
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    // Not JSON — fall back to the raw value, per this function's contract
    return value
  }
}

/** Parse JSON with a strict fallback — returns fallback on parse failure instead of the raw string. */
function parseJsonOrFallback<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    // Not JSON — return the caller's fallback, per this function's contract
    return fallback
  }
}

/**
 * Transform raw trace spans into structured TurnData for graders.
 *
 * Extraction logic:
 * - messages: from `chat.sendMessage` spans, ordered by startedAt
 * - toolCalls: from `autonomous.tool` spans with terminal status, deduped by span id, ordered by endedAt
 * - stateMutations: from `state.save` spans where changed_keys has length > 0
 * - workflowSpans: from `handler.workflow` spans
 * - handler: from `handler.conversation`, `handler.event`, or `handler.workflow` span with terminal status
 */
export function transformSpans(spans: Span[]): TurnData {
  return {
    messages: extractMessages(spans),
    toolCalls: extractToolCalls(spans),
    stateMutations: extractStateMutations(spans),
    workflowSpans: extractWorkflowSpans(spans),
    ...extractHandler(spans),
  }
}

function extractMessages(spans: Span[]): string[] {
  return spans
    .filter((s) => s.name === 'chat.sendMessage' && data(s)['message.preview'])
    .sort((a, b) => a.timing.startedAt - b.timing.startedAt)
    .map((s) => String(data(s)['message.preview']))
}

function extractToolCalls(spans: Span[]): ToolCall[] {
  const toolSpans = spans.filter(
    (s) => s.name === 'autonomous.tool' && s.status !== 'running' && data(s)['autonomous.tool.name']
  )

  // Deduplicate by span id
  const seen = new Set<string>()
  const unique = toolSpans.filter((s) => {
    if (seen.has(s.id.span)) return false
    seen.add(s.id.span)
    return true
  })

  return unique
    .sort((a, b) => (a.timing.endedAt ?? Infinity) - (b.timing.endedAt ?? Infinity))
    .map((s) => {
      const d = data(s)
      const input = parseJsonOrFallback<Record<string, unknown>>(d['autonomous.tool.input'], {})
      return {
        name: String(d['autonomous.tool.name']),
        input,
        output: String(d['autonomous.tool.output'] ?? ''),
        status: String(d['autonomous.tool.status'] ?? 'unknown'),
      }
    })
}

function extractStateMutations(spans: Span[]): StateMutation[] {
  return spans
    .filter((s) => {
      if (s.name !== 'state.save') return false
      const d = data(s)
      const changedKeys = d['state.changed_keys']
      return Array.isArray(changedKeys) && changedKeys.length > 0
    })
    .map((s) => {
      const d = data(s)
      return {
        type: String(d['type'] ?? 'unknown'),
        changedKeys: (d['state.changed_keys'] as string[]) ?? [],
        previous: tryParseJson(d['state.previous_value']),
        current: tryParseJson(d['state.value']),
        swappedToFile: d['swapped_to_file'] === true,
      }
    })
}

function extractWorkflowSpans(spans: Span[]): WorkflowSpan[] {
  return spans
    .filter((s) => s.name === 'handler.workflow')
    .map((s) => {
      const d = data(s)
      const result: WorkflowSpan = {
        name: String(d['workflow.name'] || d['workflowName'] || ''),
        status: s.status as WorkflowSpan['status'],
      }
      const statusFinal = d['workflow.status.final']
      if (statusFinal) {
        result.statusFinal = String(statusFinal)
      }
      return result
    })
}

function extractHandler(spans: Span[]): { handlerDuration: number; handlerStatus: 'ok' | 'error' } {
  const handler = spans.find(
    (s) =>
      (s.name === 'handler.conversation' || s.name === 'handler.event' || s.name === 'handler.workflow') &&
      s.status !== 'running'
  )

  if (!handler) {
    return { handlerDuration: 0, handlerStatus: 'ok' }
  }

  return {
    handlerDuration: handler.timing.duration ?? 0,
    handlerStatus: handler.status === 'error' ? 'error' : 'ok',
  }
}
