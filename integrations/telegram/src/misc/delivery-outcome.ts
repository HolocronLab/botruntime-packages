import { DeliveryOutcomeError } from '@holocronlab/botruntime-sdk'
import { TelegramError } from 'telegraf'

export function providerDeliveryError(error: unknown, operation: string): DeliveryOutcomeError {
  if (!(error instanceof TelegramError)) {
    return new DeliveryOutcomeError({
      outcome: 'outcome_unknown',
      phase: 'provider_send',
      operation,
      code: isTimeout(error) ? 'TELEGRAM_PROVIDER_TIMEOUT' : 'TELEGRAM_PROVIDER_TRANSPORT',
      message: 'Telegram provider response was not received after dispatch',
      cause: error,
    })
  }
  const code = Number.isInteger(error.code) ? `TELEGRAM_HTTP_${error.code}` : 'TELEGRAM_PROVIDER_REJECTED'
  return new DeliveryOutcomeError({
    outcome: 'failed',
    phase: 'provider_send',
    operation,
    code,
    message: 'Telegram provider rejected the delivery request',
    cause: error,
  })
}

export function protectedDownloadError(error: unknown, operation: string, code: string): DeliveryOutcomeError {
  return new DeliveryOutcomeError({
    outcome: 'failed',
    phase: 'protected_download',
    operation,
    code,
    message: 'Protected media download failed before provider dispatch',
    cause: error,
  })
}

function isTimeout(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current = error
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current)
    if (current instanceof Error) {
      const name = current.name.toLowerCase()
      const message = current.message.toLowerCase()
      if (name.includes('abort') || name.includes('timeout') || message.includes('aborted') || message.includes('timeout')) {
        return true
      }
      current = current.cause
      continue
    }
    break
  }
  return false
}
