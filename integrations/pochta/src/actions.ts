import type { IntegrationLogger } from '@holocronlab/botruntime-sdk'
import { PochtaClient, type TrackingResult } from './pochta-api'

export type PochtaConfiguration = { login: string; password: string }

export async function trackShipment(
  config: PochtaConfiguration,
  trackingNumber: string,
  logger: IntegrationLogger,
): Promise<TrackingResult> {
  const result = await new PochtaClient(config).track(trackingNumber)
  logger.forBot().info(`Почта России: проверка завершена, статус ${result.status}`)
  return result
}
