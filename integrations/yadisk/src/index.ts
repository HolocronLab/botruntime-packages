// Реализация интеграции: register/unregister + actions. Тип props фиксируем как
// IntegrationProps (=BaseIntegration), чтобы хэндлеры контекстно типизировались
// без сгенерированного .botpress (там ctx.configuration/input — any; узкие типы
// живут в actions.ts/config.ts). Только actions — входящих вебхуков нет.
import { Integration, type IntegrationProps } from '@holocronlab/botruntime-sdk'
import { createCaseFolder, downloadDocument, getLink, uploadDocument } from './actions'
import { onRegister } from './setup'

const integration: IntegrationProps = {
  register: async ({ ctx, logger }) => {
    await onRegister(ctx.configuration, logger)
  },
  unregister: async () => {
    // Нет вебхука/внешних ресурсов — отключать нечего.
  },
  actions: {
    createCaseFolder: async ({ ctx, input, logger }) => createCaseFolder(ctx.configuration, input.path, logger),
    uploadDocument: async ({ ctx, input, logger }) => uploadDocument(ctx.configuration, input, logger),
    getLink: async ({ ctx, input, logger }) => getLink(ctx.configuration, input.path, logger),
    downloadDocument: async ({ ctx, input }) => downloadDocument(ctx.configuration, input.path),
  },
  channels: {},
  handler: async () => {
    // Интеграция только actions — входящих сообщений/вебхуков нет.
  },
}

export default new Integration(integration)
