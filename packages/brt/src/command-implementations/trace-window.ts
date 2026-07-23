import * as errors from '../errors'
import { parseTimeFilter, type ParsedTimeFilter } from '../utils/time-filter'

export const DEFAULT_TRACE_LIMIT = 20
export const MAX_TRACE_LIMIT = 10_000
export const MAX_TRACE_PAGE_SIZE = 1_000
export const MAX_TRACE_PAGES = 100

const POSITIVE_DECIMAL = /^[1-9][0-9]*$/

type TraceWindowInput = {
  limit?: number
  since?: string
  until?: string
}

type TraceWindowTokens = {
  limit?: string
  since?: string
  until?: string
}

export type ResolvedTraceWindow = {
  limit: number
  since?: ParsedTimeFilter
  until?: ParsedTimeFilter
}

export function resolveTraceWindow(
  input: TraceWindowInput,
  tokens: TraceWindowTokens,
  nowMs: number
): ResolvedTraceWindow {
  const tokenLimit = tokens.limit === undefined ? undefined : parsePositiveInteger(tokens.limit, 'limit=')
  const limit = mergeFilter(input.limit, tokenLimit, 'limit') ?? DEFAULT_TRACE_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TRACE_LIMIT) {
    throw new errors.BotpressCLIError(`--limit must be an integer between 1 and ${MAX_TRACE_LIMIT}`)
  }

  const rawSince = mergeFilter(input.since, tokens.since, 'since')
  const rawUntil = mergeFilter(input.until, tokens.until, 'until')
  const since = rawSince === undefined ? undefined : parseTimeFilter(rawSince, '--since', nowMs)
  const until = rawUntil === undefined ? undefined : parseTimeFilter(rawUntil, '--until', nowMs)
  if (since !== undefined && until !== undefined && since.timeMs > until.timeMs) {
    throw new errors.BotpressCLIError('--since must not be after --until')
  }

  return {
    limit,
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
  }
}

export function requirePositiveDecimalCursor(value: string | undefined, command: string): void {
  if (value !== undefined && !POSITIVE_DECIMAL.test(value)) {
    throw new errors.BotpressCLIError(
      `--next-token must be a positive decimal cursor returned by ${command}`
    )
  }
}

function mergeFilter<T>(named: T | undefined, token: T | undefined, label: string): T | undefined {
  if (named !== undefined && token !== undefined) {
    throw new errors.BotpressCLIError(`${label} filter conflict: provide it only once as a flag or token`)
  }
  return named ?? token
}

function parsePositiveInteger(value: string, label: string): number {
  if (!POSITIVE_DECIMAL.test(value)) {
    throw new errors.BotpressCLIError(`${label} must be a positive decimal integer`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new errors.BotpressCLIError(`${label} is too large`)
  return parsed
}
