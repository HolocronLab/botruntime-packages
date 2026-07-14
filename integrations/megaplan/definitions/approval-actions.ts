import { type ActionDefinition, z } from '@holocronlab/botruntime-sdk'

const createNegotiationTaskInput = z.object({
  name: z.string().min(1).title('Название'),
  responsibleId: z.string().min(1).title('ID ответственного'),
  approverIds: z.array(z.string().min(1)).min(1).title('ID согласователей'),
  dealIds: z.array(z.string().min(1)).default([]).title('ID сделок'),
  materialName: z.string().min(1).title('Название материала'),
  materialFileId: z.string().min(1).title('ID неизменяемого файла Botruntime'),
  materialSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).title('SHA-256 материала'),
  statement: z.string().optional().title('Постановка задачи'),
})

const createNegotiationTaskOutput = z.object({
  taskId: z.string(),
  itemId: z.string().optional(),
  versionId: z.string().optional(),
})

const getNegotiationDecisionInput = z.object({ taskId: z.string().min(1) })
const getNegotiationDecisionOutput = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
  itemId: z.string().optional(),
  versionId: z.string().optional(),
  fileId: z.string().optional(),
  filePath: z.string().optional(),
  fileName: z.string().optional(),
  fileUrl: z.string().optional().describe('Временный URL серверной копии утверждённой версии'),
  approvedFileId: z.string().optional().describe('Стабильный ID серверной копии в Botruntime Files'),
  approvedFileKey: z.string().optional().describe('Стабильный ключ серверной копии в Botruntime Files'),
  fileSha256: z.string().optional(),
  approverVisas: z.array(z.object({
    id: z.string().optional(),
    status: z.enum(['ok', 'bad', 'not_rated']).optional(),
    actorId: z.string().optional(),
    actorName: z.string().optional(),
  })).describe('Полный список виз фактической версии'),
})

export const createNegotiationTask: ActionDefinition = {
  title: 'Создать задачу-согласование',
  description: 'Создаёт нативное согласование конкретной неизменяемой версии материала.',
  input: { schema: createNegotiationTaskInput },
  output: { schema: createNegotiationTaskOutput },
}

export const getNegotiationDecision: ActionDefinition = {
  title: 'Прочитать решение согласования',
  description: 'Перечитывает фактическую актуальную версию и решение согласователя из Мегаплана.',
  input: { schema: getNegotiationDecisionInput },
  output: { schema: getNegotiationDecisionOutput },
}

export const approvalActions = { createNegotiationTask, getNegotiationDecision } as const

export type CreateNegotiationTaskInput = z.infer<typeof createNegotiationTaskInput>
export type CreateNegotiationTaskOutput = z.infer<typeof createNegotiationTaskOutput>
export type GetNegotiationDecisionInput = z.infer<typeof getNegotiationDecisionInput>
export type GetNegotiationDecisionOutput = z.infer<typeof getNegotiationDecisionOutput>
