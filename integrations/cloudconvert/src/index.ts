import { Integration, RuntimeError, type IntegrationProps } from '@holocronlab/botruntime-sdk'
import { convertToPdf } from './actions'
import { CloudConvertClient } from './cloudconvert-client'
import { normalizeCloudConvertError } from './errors'

const integration: IntegrationProps = {
  register: async ({ ctx, logger }) => {
    try {
      await new CloudConvertClient(ctx.configuration).verify()
      logger.info('CloudConvert: API v2 подключён')
    } catch (caught) {
      const error = normalizeCloudConvertError(caught)
      throw new RuntimeError(`CloudConvert: API key не прошёл проверку: ${error.message}`, error)
    }
  },
  unregister: async () => {},
  actions: {
    convertToPdf: async ({ ctx, input, logger }) => convertToPdf(ctx.configuration, input, logger),
  },
  channels: {},
  handler: async () => {},
}

export default new Integration(integration)
