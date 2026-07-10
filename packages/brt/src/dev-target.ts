import * as errors from './errors'

export const DEV_TARGET_TAG = 'botruntime.devTargetBotId'

export interface DevBotTarget {
  runtimeBotId: string
  targetBotId: string
}

type DevBotShape = {
  id?: unknown
  dev?: unknown
  tags?: unknown
}

export function resolveDevBotTarget(
  bot: DevBotShape,
  expectedRuntimeBotId: string,
  expectedTargetBotId?: string
): DevBotTarget {
  if (bot.id !== expectedRuntimeBotId) {
    throw new errors.BotpressCLIError(
      `Dev bot response id "${String(bot.id)}" does not match expected runtime id "${expectedRuntimeBotId}".`
    )
  }
  if (bot.dev !== true) {
    throw new errors.BotpressCLIError(`Dev bot "${expectedRuntimeBotId}" response must have dev:true.`)
  }
  const tags = bot.tags
  const target =
    tags && typeof tags === 'object' && !Array.isArray(tags)
      ? (tags as Record<string, unknown>)[DEV_TARGET_TAG]
      : undefined
  if (typeof target !== 'string' || !/^[1-9][0-9]*$/.test(target)) {
    throw new errors.BotpressCLIError(`Dev target tag ${DEV_TARGET_TAG} must contain a positive decimal core bot id.`)
  }
  if (expectedTargetBotId !== undefined && target !== expectedTargetBotId) {
    throw new errors.BotpressCLIError(
      `Dev target changed for runtime id "${expectedRuntimeBotId}": expected ${expectedTargetBotId}, received ${target}.`
    )
  }
  return { runtimeBotId: expectedRuntimeBotId, targetBotId: target }
}
