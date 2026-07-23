import { z } from '@holocronlab/botruntime-sdk'

// Пути в action'ах — case-относительные (напр. lead-1/case-2/ddu/doc.jpg).
// Префикс app:/<yadiskFolder>/ навешивает сама интеграция (см. src/paths.ts):
// бот не знает про схему app:/.
const relativePath = z
  .string()
  .min(1)
  .regex(/^(?![a-z]+:\/)/i, 'Путь должен быть относительным, без app:/ или disk:/')
  .regex(/^(?!\s*\.\.?\s*(?:\/|$))(?!.*\/\s*\.\.?\s*(?:\/|$)).*$/, 'Сегменты . и .. запрещены')
  .describe('Путь относительно корневой папки, напр. lead-1/case-2/ddu/doc.jpg')
const absoluteDiskPath = z.string().describe('Абсолютный путь app:/...')
const immutableFileRef = z.object({
  id: z.string().min(1).max(1024).describe('Bot-scoped Files API key'),
  size: z.number().int().min(0).max(1 << 30).describe('Точный размер поколения в байтах'),
  contentType: z.string().max(255).optional().describe('MIME-тип поколения'),
  filename: z.string().max(1024).optional().describe('Имя файла поколения'),
  checksum: z.string().regex(/^[0-9a-f]{64}$/i).describe('SHA-256 поколения'),
})

export const actions = {
  createCaseFolder: {
    title: 'Создать папку дела',
    description: 'Идемпотентно создаёт папку дела и предков под app:/. Существующая папка — не ошибка (409).',
    input: { schema: z.object({ path: relativePath.describe('Путь папки относительно корневой') }) },
    output: { schema: z.object({ diskPath: absoluteDiskPath }) },
  },
  uploadDocument: {
    title: 'Загрузить документ',
    description: 'Длительно и потоково загружает immutable FileRef без base64 и повторов после передачи провайдеру.',
    attributes: {
      'botruntime.durableOperation': 'v1',
    },
    input: {
      schema: z.object({
        path: relativePath,
        fileRef: immutableFileRef,
        mimeType: z.string().optional().describe('MIME-тип содержимого'),
        overwrite: z.boolean().default(true).describe('Перезаписать существующий файл'),
      }),
    },
    output: {
      schema: z.object({
        diskPath: absoluteDiskPath,
        size: z.number().int().min(0),
        checksum: z.string().regex(/^[0-9a-f]{64}$/i),
      }),
    },
  },
  getLink: {
    title: 'Опубликовать и получить ссылку',
    description: 'Публикует ресурс и возвращает публичную ссылку (yadi.sk) и web deep-link (disk:/).',
    input: { schema: z.object({ path: relativePath }) },
    output: {
      schema: z.object({
        publicUrl: z.string().min(1).describe('Публичная ссылка https://yadi.sk/d/...'),
        diskPath: z.string().describe('Web deep-link в Диск фирмы: disk:/Приложения/...'),
      }),
    },
  },
}
