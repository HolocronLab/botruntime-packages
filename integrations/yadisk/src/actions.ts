// Реализация actions интеграции. Каждое действие: конфиг → клиент, относительный
// путь → абсолютный app:/, операция Диска. Деньги/ПДн тут не трогаем — это файловый
// слой (H2: Диск — source of truth, наружу уходят ссылки).
import { RuntimeError, type IntegrationLogger } from '@holocronlab/botruntime-sdk'
import { clientFromConfig, type YadiskConfiguration } from './config'
import { resolveAppPath } from './paths'

export type UploadInput = {
  path: string
  fileUrl?: string
  contentBase64?: string
  mimeType?: string
  overwrite?: boolean
}

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

// uploadDocument — залить документ. Источник байтов — ровно один из fileUrl /
// contentBase64 (оба или ни одного — конфликт, fail-loud).
export async function uploadDocument(
  cfg: YadiskConfiguration,
  input: UploadInput,
  logger: IntegrationLogger,
): Promise<{ diskPath: string }> {
  return runAction(async () => {
    const client = clientFromConfig(cfg)
    const diskPath = resolveAppPath(cfg.yadiskFolder ?? '', input.path)
    const data = await resolveBytes(input)
    await client.upload(diskPath, data, { mimeType: input.mimeType, overwrite: input.overwrite ?? true })
    logger.forBot().info('Яндекс.Диск: документ загружен')
    return { diskPath }
  })
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

// downloadDocument — скачать файл (для HITL/повторной отправки). Байты → base64
// (JSON-safe возврат action'а).
export async function downloadDocument(
  cfg: YadiskConfiguration,
  path: string,
): Promise<{ contentBase64: string }> {
  return runAction(async () => {
    const client = clientFromConfig(cfg)
    const abs = resolveAppPath(cfg.yadiskFolder ?? '', path)
    const bytes = await client.download(abs)
    return { contentBase64: Buffer.from(bytes).toString('base64') }
  })
}

async function resolveBytes(input: UploadInput): Promise<Uint8Array> {
  const hasUrl = Boolean(input.fileUrl)
  const hasBase64 = Boolean(input.contentBase64)
  if (hasUrl === hasBase64) {
    throw new RuntimeError('uploadDocument: задайте ровно один источник — fileUrl или contentBase64')
  }
  if (input.contentBase64) {
    return decodeBase64(input.contentBase64)
  }
  // Источник тянем без авторизации: секреты (в т.ч. токен Telegram) в URL не кладём.
  const res = await fetch(input.fileUrl as string)
  if (!res.ok) {
    throw new RuntimeError(`uploadDocument: источник недоступен, HTTP ${res.status}`)
  }
  return new Uint8Array(await res.arrayBuffer())
}

async function runAction<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof RuntimeError) throw e
    throw new RuntimeError(e instanceof Error ? e.message : String(e))
  }
}

function decodeBase64(value: string): Uint8Array {
  const compact = value.replace(/\s+/g, '')
  if (compact.length === 0 || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new RuntimeError('uploadDocument: contentBase64 должен быть валидным base64')
  }
  const firstPad = compact.indexOf('=')
  if (firstPad !== -1 && !/^=+$/.test(compact.slice(firstPad))) {
    throw new RuntimeError('uploadDocument: contentBase64 должен быть валидным base64')
  }
  const decoded = Buffer.from(compact, 'base64')
  if (decoded.toString('base64') !== compact) {
    throw new RuntimeError('uploadDocument: contentBase64 должен быть валидным base64')
  }
  return new Uint8Array(decoded)
}
