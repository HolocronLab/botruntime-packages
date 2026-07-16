import { RuntimeError, type IntegrationLogger } from '@holocronlab/botruntime-sdk'
import { clientFromConfig, type TerritorialJurisdictionConfiguration } from './config'

export async function onRegister(
  cfg: TerritorialJurisdictionConfiguration,
  logger: IntegrationLogger,
): Promise<void> {
  const client = clientFromConfig(cfg)
  try {
    await client.getAccount()
  } catch (error) {
    throw new RuntimeError(
      `Территориальная подсудность: токен не прошёл проверку (${error instanceof Error ? error.message : 'ошибка доступа'})`,
    )
  }
  logger.forBot().info('Территориальная подсудность: токен принят, интеграция подключена')
}
