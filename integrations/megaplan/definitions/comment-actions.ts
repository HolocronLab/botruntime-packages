import { type ActionDefinition, z } from '@holocronlab/botruntime-sdk'

const addCommentInput = z.object({
  owner: z.enum(['deal', 'contractor', 'task']).title('Тип владельца'),
  ownerId: z.string().min(1).title('ID владельца'),
  contentHtml: z.string().min(1).title('HTML-содержимое').describe('Текст комментария в HTML'),
})
const addCommentOutput = z.object({ id: z.string().title('ID комментария') })

export const addComment: ActionDefinition = {
  title: 'Добавить комментарий',
  description: 'HTML-комментарий к сделке, контрагенту или задаче.',
  input: { schema: addCommentInput },
  output: { schema: addCommentOutput },
}

export const commentActions = { addComment } as const

export type AddCommentInput = z.infer<typeof addCommentInput>
export type AddCommentOutput = z.infer<typeof addCommentOutput>
