import { z } from '@botpress/sdk'

// Пути в action'ах — case-относительные (напр. lead-1/case-2/ddu/doc.jpg).
// Префикс app:/<yadiskFolder>/ навешивает сама интеграция (см. src/paths.ts):
// бот не знает про схему app:/.
const relativePath = z
  .string()
  .min(1)
  .refine((v) => !/^[a-z]+:\//i.test(v), 'Путь должен быть относительным, без app:/ или disk:/')
  .refine((v) => !v.split('/').some((s) => s.trim() === '.' || s.trim() === '..'), 'Сегменты . и .. запрещены')
  .describe('Путь относительно корневой папки, напр. lead-1/case-2/ddu/doc.jpg')
const absoluteDiskPath = z.string().describe('Абсолютный путь app:/...')

export const actions = {
  createCaseFolder: {
    title: 'Создать папку дела',
    description: 'Идемпотентно создаёт папку дела и предков под app:/. Существующая папка — не ошибка (409).',
    input: { schema: z.object({ path: relativePath.describe('Путь папки относительно корневой') }) },
    output: { schema: z.object({ diskPath: absoluteDiskPath }) },
  },
  uploadDocument: {
    title: 'Загрузить документ',
    description: 'Загружает документ (overwrite). Источник байтов — ровно один из fileUrl или contentBase64.',
    input: {
      schema: z.object({
        path: relativePath,
        fileUrl: z.string().url().optional().describe('URL источника байтов (без секретов в URL)'),
        contentBase64: z.string().optional().describe('Содержимое base64 (альтернатива fileUrl)'),
        mimeType: z.string().optional().describe('MIME-тип содержимого'),
        overwrite: z.boolean().default(true).describe('Перезаписать существующий файл'),
      }),
    },
    output: { schema: z.object({ diskPath: absoluteDiskPath }) },
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
  downloadDocument: {
    title: 'Скачать документ',
    description: 'Скачивает файл по пути и возвращает содержимое base64 (для HITL/повторной отправки).',
    input: { schema: z.object({ path: relativePath }) },
    output: { schema: z.object({ contentBase64: z.string().describe('Содержимое файла base64') }) },
  },
}
