import { type EventDefinition, z } from '@holocronlab/botruntime-sdk'

export const entityCommandSchema = z
  .object({
    eventId: z.string().min(1).title('ID события').describe('Уникальный ID нажатия для идемпотентности'),
    entityType: z.string().min(1).title('Тип сущности').describe('Тип сущности Megaplan, например deal или task'),
    entityId: z.string().min(1).title('ID сущности'),
    command: z.string().min(1).title('Команда').describe('Имя команды, семантику которого определяет бот'),
    arguments: z
      .record(z.unknown())
      .default({})
      .title('Аргументы')
      .describe('Доменные аргументы команды для валидации ботом'),
    actorId: z.string().optional().title('ID сотрудника').describe('Аудит; авторизация выполняется webhook-secret'),
  })
  .strict()

export const events = {
  entityCommand: {
    title: 'Команда по сущности',
    description: 'Универсальная команда из сценария Мегаплана; бизнес-семантику и аргументы валидирует бот.',
    schema: entityCommandSchema,
  } satisfies EventDefinition,
}

export type EntityCommand = z.infer<typeof entityCommandSchema>
