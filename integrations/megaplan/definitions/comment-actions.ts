import { type ActionDefinition, operationFileRef, z } from '@holocronlab/botruntime-sdk'

// Public start input contains only the bot-scoped key. CloudAPI resolves and
// pins the authoritative generation before persisting the operation.
const admittedFileRef = operationFileRef('resolve-current')
  .describe('Bot-scoped Files API key')

const addCommentInput = z.object({
  owner: z.enum(['deal', 'contractor', 'task']).title('Тип владельца'),
  ownerId: z.string().min(1).max(256).title('ID владельца'),
  contentHtml: z.string().min(1).max(65_000).title('HTML-содержимое').describe('Текст комментария в HTML'),
}).strict()
const addCommentOutput = z.object({ id: z.string().title('ID комментария') })

const publishCaseDocumentInput = z.object({
  owner: z.enum(['deal', 'contractor', 'task']).title('Тип владельца'),
  ownerId: z.string().min(1).max(256).title('ID владельца'),
  contentHtml: z.string().min(1).max(64 * 1024).title('HTML-содержимое').describe('Текст записи в журнале'),
  attachments: z.array(z.object({
    fileRef: admittedFileRef,
    displayName: z.string()
      .min(1)
      .max(1024)
      .regex(/^[^\r\n]*[^ \t\r\n][^\r\n]*$/)
      .optional()
      .title('Имя вложения'),
    mimeType: z.string()
      .min(1)
      .max(255)
      .regex(/^[!-~]+( +[!-~]+)*$/)
      .optional()
      .title('MIME-тип'),
  }).strict()).min(1).max(16).title('Вложения').describe('Упорядоченные immutable FileRef; порядок сохраняется в комментарии'),
}).strict()
const publishCaseDocumentOutput = z.object({
  commentId: z.string().title('ID комментария'),
  attachmentIds: z.array(z.string()).min(1).max(16).title('ID файлов Megaplan').describe('В том же порядке, что и входные вложения'),
})

export const addComment: ActionDefinition = {
  title: 'Добавить комментарий',
  description: 'HTML-комментарий к сделке, контрагенту или задаче.',
  attributes: {
    'botruntime.durableOperation': 'v1',
    'botruntime.operationCheckpoint': 'v1',
    'botruntime.operationCheckpoint.maxEntries': '1',
    'botruntime.operationCheckpoint.maxValueBytes': '512',
    'botruntime.operationCheckpoint.maxBytes': '1024',
  },
  input: { schema: addCommentInput },
  output: { schema: addCommentOutput },
}

export const publishCaseDocument: ActionDefinition = {
  title: 'Опубликовать документы дела',
  description: 'Потоково переносит immutable FileRef в Megaplan и прикрепляет их к одной записи журнала.',
  attributes: {
    'botruntime.durableOperation': 'v1',
    'botruntime.fileRefAdmission': 'schema-v1',
    'botruntime.operationCheckpoint': 'v1',
    'botruntime.operationCheckpoint.maxEntries': '17',
    'botruntime.operationCheckpoint.maxValueBytes': '512',
    'botruntime.operationCheckpoint.maxBytes': '12288',
  },
  input: { schema: publishCaseDocumentInput },
  output: { schema: publishCaseDocumentOutput },
}

export const commentActions = { addComment, publishCaseDocument } as const

export type AddCommentInput = z.infer<typeof addCommentInput>
export type AddCommentOutput = z.infer<typeof addCommentOutput>
export type PublishCaseDocumentInput = z.infer<typeof publishCaseDocumentInput>
export type PublishCaseDocumentOutput = z.infer<typeof publishCaseDocumentOutput>
