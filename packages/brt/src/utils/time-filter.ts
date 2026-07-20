import * as errors from '../errors'

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/
const DURATION = /^([0-9]+)(ms|s|m|h|d)$/
const DURATION_MS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const

export type ParsedTimeFilter = { wire: string; timeMs: number }

/**
 * Parses the shared BRT time-filter contract used by traces, conversations and logs.
 * Durations are look-back windows from one command-scoped `nowMs`; RFC3339 values
 * retain their original wire representation.
 */
export function parseTimeFilter(value: string, label: string, nowMs: number): ParsedTimeFilter {
  const duration = DURATION.exec(value)
  if (duration) {
    const amount = Number(duration[1])
    const delta = amount * DURATION_MS[duration[2] as keyof typeof DURATION_MS]
    const timeMs = nowMs - delta
    if (!Number.isSafeInteger(amount) || !Number.isFinite(timeMs) || timeMs < 0) {
      throw new errors.BotpressCLIError(`${label} duration is too large`)
    }
    return { wire: new Date(timeMs).toISOString(), timeMs }
  }

  if (!isRFC3339Timestamp(value)) {
    throw new errors.BotpressCLIError(`${label} must be RFC3339 or a duration such as 30s, 5m, or 1h`)
  }
  return { wire: value, timeMs: Date.parse(value) }
}

export function isRFC3339Timestamp(value: string): boolean {
  const match = RFC3339.exec(value)
  return match !== null && validTimestampParts(match) && Number.isFinite(Date.parse(value))
}

function validTimestampParts(match: RegExpExecArray): boolean {
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[7] === undefined ? 0 : Number(match[7])
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8])
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  )
}
