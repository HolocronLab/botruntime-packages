import { Integration, type IntegrationProps } from '@holocronlab/botruntime-sdk'
import { findByAddress, findByCoordinates, getAccount } from './actions'
import { onRegister } from './setup'

const integration: IntegrationProps = {
  register: async ({ ctx, logger }) => {
    await onRegister(ctx.configuration, logger)
  },
  unregister: async () => {
    // Вебхуков и внешних ресурсов нет.
  },
  actions: {
    findByAddress: async ({ ctx, input, logger }) => findByAddress(ctx.configuration, input.address, logger),
    findByCoordinates: async ({ ctx, input, logger }) =>
      findByCoordinates(ctx.configuration, input.latitude, input.longitude, logger),
    getAccount: async ({ ctx }) => getAccount(ctx.configuration),
  },
  channels: {},
  handler: async () => {
    // Интеграция только с actions — входящих событий нет.
  },
}

export default new Integration(integration)
