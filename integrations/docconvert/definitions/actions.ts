import { z } from '@holocronlab/botruntime-sdk'

const sha256Schema = z.string().regex(/^[a-fA-F0-9]{64}$/).describe('SHA-256 в hex')

export const actions = {
  convertToPdf: {
    title: 'Конвертировать DOCX в PDF',
    description: 'Скачивает версию DOCX по защищённому URL, сверяет SHA-256 и возвращает PDF.',
    input: {
      schema: z.object({
        fileUrl: z.string().url().title('URL исходного DOCX'),
        sha256: sha256Schema.title('SHA-256 исходника'),
        sourceFormat: z.enum(['docx']).title('Формат исходника'),
      }),
    },
    output: {
      schema: z.object({
        pdfBase64: z.string().min(1).title('PDF в base64'),
        pageCount: z.number().int().positive().title('Количество страниц'),
        sourceSha256: sha256Schema.title('Фактический SHA-256 исходника'),
        engine: z.string().min(1).title('Движок конвертации'),
      }),
    },
  },
}
