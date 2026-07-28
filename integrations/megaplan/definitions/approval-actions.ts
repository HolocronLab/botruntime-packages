import { type ActionDefinition, operationFileRef, z } from '@holocronlab/botruntime-sdk'

const admittedMaterialFile = operationFileRef('resolve-current')
  .describe('Закрепляемый файл Botruntime размером не более 20 МиБ')

const createNegotiationTaskInput = z.object({
  name: z.string().min(1).max(960).title('Название'),
  responsibleId: z.string().min(1).max(256).title('ID ответственного'),
  approverIds: z.array(z.string().min(1).max(256)).min(1).max(32).title('ID согласователей'),
  dealIds: z.array(z.string().min(1).max(256)).max(64).title('ID сделок'),
  materialName: z.string().min(1).max(1024).title('Название материала'),
  materialFile: admittedMaterialFile.title('Неизменяемый файл Botruntime'),
  statement: z.string().max(65_000).optional().title('Постановка задачи'),
}).strict()

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
  fileUrl: z.string().optional().describe('Авторизуемый URL серверной копии утверждённой версии'),
  approvedFileId: z.string().optional().describe('Стабильный ID серверной копии в Botruntime Files'),
  approvedFileKey: z.string().optional().describe('Стабильный ключ серверной копии в Botruntime Files'),
  fileSha256: z.string().optional(),
  actorId: z.string().optional().describe('ID представителя последней терминальной визы (совместимость)'),
  actorName: z.string().optional().describe('Имя представителя последней терминальной визы (совместимость)'),
  approverVisas: z.array(z.object({
    id: z.string().optional(),
    status: z.enum(['ok', 'bad', 'not_rated']).optional(),
    actorId: z.string().optional(),
    actorName: z.string().optional(),
    comment: z.string().optional().describe('Комментарий согласующего, включая причину отказа'),
    timeCreated: z.string().optional().describe('Время создания визы по данным Megaplan'),
  })).describe('Полный список виз фактической версии'),
})

export const createNegotiationTask: ActionDefinition = {
  title: 'Создать задачу-согласование',
  description: 'Создаёт согласование закреплённой версии материала размером не более 20 МиБ.',
  attributes: {
    'botruntime.durableOperation': 'v1',
    'botruntime.fileRefAdmission': 'schema-v1',
    'botruntime.operationCheckpoint': 'v1',
    'botruntime.operationCheckpoint.maxEntries': '2',
    'botruntime.operationCheckpoint.maxValueBytes': '512',
    'botruntime.operationCheckpoint.maxBytes': '2048',
  },
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
