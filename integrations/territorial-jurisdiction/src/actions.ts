import { RuntimeError, type IntegrationLogger } from '@holocronlab/botruntime-sdk'
import { clientFromConfig, type TerritorialJurisdictionConfiguration } from './config'
import type { JurisdictionAccount, JurisdictionSearchResult } from './territorial-jurisdiction-api'

export async function findByAddress(
  cfg: TerritorialJurisdictionConfiguration,
  address: string,
  logger: IntegrationLogger,
): Promise<JurisdictionSearchResult> {
  return runAction(async () => {
    const result = await clientFromConfig(cfg).findByAddress(address)
    logger.forBot().info('Территориальная подсудность: суды определены по адресу')
    return result
  })
}

export async function findByCoordinates(
  cfg: TerritorialJurisdictionConfiguration,
  latitude: number,
  longitude: number,
  logger: IntegrationLogger,
): Promise<JurisdictionSearchResult> {
  return runAction(async () => {
    const result = await clientFromConfig(cfg).findByCoordinates(latitude, longitude)
    logger.forBot().info('Территориальная подсудность: суды определены по координатам')
    return result
  })
}

export async function getAccount(cfg: TerritorialJurisdictionConfiguration): Promise<JurisdictionAccount> {
  return runAction(() => clientFromConfig(cfg).getAccount())
}

async function runAction<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof RuntimeError) throw error
    throw new RuntimeError(error instanceof Error ? error.message : 'Неизвестная ошибка API подсудности')
  }
}
