import { Integration, type IntegrationProps } from '@holocronlab/botruntime-sdk'
import { trackShipment } from './actions'
import { PochtaClient } from './pochta-api'
import { toPochtaRegistrationError } from './registration-error'

const integration: IntegrationProps = {
  register: async ({ ctx, logger }) => {
    try {
      await new PochtaClient(ctx.configuration).verify()
    } catch (error) {
      throw toPochtaRegistrationError(error)
    }
    logger.forBot().info('Почта России: интеграция отслеживания подключена')
  },
  unregister: async () => {},
  actions: {
    trackShipment: async ({ ctx, input, logger }) =>
      trackShipment(ctx.configuration, input.trackingNumber, logger),
  },
  channels: {},
  handler: async () => {},
}

export default new Integration(integration)
