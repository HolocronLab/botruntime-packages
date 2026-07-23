// Реализация actions интеграции. Каждое действие: конфиг → клиент, относительный
// путь → абсолютный app:/, операция Диска. Деньги/ПДн тут не трогаем — это файловый
// слой (H2: Диск — source of truth, наружу уходят ссылки).
import { RuntimeError, type IntegrationLogger } from '@holocronlab/botruntime-sdk'
import { clientFromConfig, type YadiskConfiguration } from './config'
import { resolveAppPath } from './paths'

// createCaseFolder — идемпотентно создать папку дела (и предков). 409 = уже есть.
export async function createCaseFolder(
  cfg: YadiskConfiguration,
  path: string,
  logger: IntegrationLogger,
): Promise<{ diskPath: string }> {
  return runAction(async () => {
    const client = clientFromConfig(cfg)
    const diskPath = resolveAppPath(cfg.yadiskFolder ?? '', path)
    await client.mkdirAll(diskPath)
    logger.forBot().info('Яндекс.Диск: папка готова')
    return { diskPath }
  })
}

// uploadDocument is capability-only in v0.3.0. CloudAPI starts it through the
// durable operation API; ordinary action_triggered calls must never become an
// implicit base64 or retry fallback.
export async function uploadDocument(): Promise<never> {
  throw new RuntimeError('uploadDocument: используйте startIntegrationOperation с fileRef')
}

// getLink — опубликовать ресурс и вернуть ссылки. publicUrl (yadi.sk) читается
// только через stat после publish (в TS-доноре stat не было — это и был пробел).
export async function getLink(
  cfg: YadiskConfiguration,
  path: string,
  logger: IntegrationLogger,
): Promise<{ publicUrl: string; diskPath: string }> {
  return runAction(async () => {
    const client = clientFromConfig(cfg)
    const abs = resolveAppPath(cfg.yadiskFolder ?? '', path)
    await client.publish(abs)
    const meta = await client.stat(abs)
    if (!meta.publicUrl) {
      logger.forBot().warn('Яндекс.Диск: публичная ссылка ещё не доступна')
      throw new RuntimeError('Яндекс.Диск: публикация не вернула публичную ссылку')
    }
    return { publicUrl: meta.publicUrl, diskPath: meta.path }
  })
}

async function runAction<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof RuntimeError) throw e
    throw new RuntimeError(e instanceof Error ? e.message : String(e))
  }
}
