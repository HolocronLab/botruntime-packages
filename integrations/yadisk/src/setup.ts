// Lifecycle интеграции. register проверяет токен боевым вызовом (fail-loud при
// install, а не при первом действии). unregister — no-op: вебхука и внешних
// ресурсов у файловой интеграции нет, отключать нечего.
import { RuntimeError, type IntegrationLogger } from '@botpress/sdk'
import { clientFromConfig, type YadiskConfiguration } from './config'

export async function onRegister(cfg: YadiskConfiguration, logger: IntegrationLogger): Promise<void> {
  const client = clientFromConfig(cfg) // нет токена → RuntimeError
  try {
    await client.verify()
  } catch (e) {
    // Сообщение клиента уже без токена; оборачиваем в RuntimeError для install-ошибки.
    throw new RuntimeError(
      `Яндекс.Диск: токен не прошёл проверку (${e instanceof Error ? e.message : 'ошибка доступа'})`,
    )
  }
  logger.forBot().info('Яндекс.Диск: токен принят, интеграция подключена')
}
