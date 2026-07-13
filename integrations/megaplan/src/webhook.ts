import { InvalidPayloadError } from '@holocronlab/botruntime-client'
import { entityCommandSchema, type EntityCommand } from '../definitions/events'
import type { IntegrationProps } from './bp'

export function parseEntityCommand(body: string | undefined): EntityCommand {
  if (!body) throw new InvalidPayloadError('Megaplan command body is empty')
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new InvalidPayloadError('Megaplan command body is not valid JSON')
  }
  try {
    return entityCommandSchema.parse(parsed)
  } catch (error) {
    throw new InvalidPayloadError(`Invalid Megaplan entity command: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const webhookHandler: IntegrationProps['handler'] = async ({ req, client }) => {
  const command = parseEntityCommand(req.body)
  await client.createEvent({ type: 'entityCommand', payload: command })
  return { status: 200 }
}
