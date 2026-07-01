import type { BotImplementation } from '@holocronlab/botruntime-sdk/dist/bot/implementation'
import { TrackedState } from '..'

import { span } from '../../telemetry/tracing'
import { adk } from '../adk'

export const setup = (bot: BotImplementation) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing internal SDK property
  const handlers = (bot as any)._actionHandlers as typeof bot.actionHandlers
  for (const action of adk.project.actions) {
    handlers[action.name] = async (props) => {
      return await span(
        'handler.action',
        {
          'action.input': props.input,
          'action.name': action.name,
          botId: props.ctx.botId,
        },
        async () => {
          await TrackedState.loadAll()

          try {
            return await action.execute(props)
          } finally {
            await TrackedState.saveAllDirty()
          }
        }
      )
    }
  }
}
