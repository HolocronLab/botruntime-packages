import { Integration, RuntimeError, type IntegrationProps } from '@holocronlab/botruntime-sdk'
import { convertToPdf } from './actions'
import { DocConvertClient } from './docconvert-client'
import { normalizeDocConvertError } from './errors'

const integration: IntegrationProps = {
  register: async ({ ctx, logger }) => {
    try {
      const engine = await new DocConvertClient(ctx.configuration).verify()
      logger.info(`docconvert: сервис конвертации подключён (${engine})`)
    } catch (caught) {
      const error = normalizeDocConvertError(caught)
      throw new RuntimeError(`docconvert: сервис не прошёл проверку: ${error.message}`, error)
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
