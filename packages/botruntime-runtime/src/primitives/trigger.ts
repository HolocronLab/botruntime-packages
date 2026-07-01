import { z } from '@holocronlab/botruntime-sdk'
import { Definitions } from './definition'
import { Errors } from '../errors'

import { EventName } from '../_types/events'
import { Triggers } from '../_types/triggers'

export namespace Typings {
  export type TriggerHandlerProps<TName extends keyof Triggers> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fallback when trigger type is not in Triggers
    event: TName extends keyof Triggers ? Triggers[TName]['event'] : any
  }

  export type Props<TName extends keyof Triggers = keyof Triggers> = {
    name: TName
    description?: string
    events: EventName[]
    /**
     * Handler function that receives the matched event
     */
    handler: (props: TriggerHandlerProps<TName>) => Promise<void> | void
  }

  export const Primitive = 'trigger' as const
}

const TriggerSchema = z.object({
  name: z
    .string()
    .min(3, 'Trigger name must be at least 3 characters')
    .max(255, 'Trigger name must be less than 255 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Trigger name must contain only alphanumeric characters and underscores'),
  description: z.string().max(1024, 'Description must be less than 1024 characters').optional(),
  events: z.array(z.string()),
  handler: z.function().describe('Handler function for the trigger'),
})

export class Trigger<TName extends keyof Triggers> implements Definitions.Primitive {
  public readonly name: TName
  public readonly description: string | undefined
  public readonly events: EventName[]
  public readonly handler: Typings.Props<TName>['handler']

  constructor(props: Typings.Props<TName>) {
    const result = TriggerSchema.safeParse(props)

    if (!result.success) {
      throw new Errors.InvalidPrimitiveError('Trigger validation failed', result.error)
    }

    this.name = result.data.name as TName
    this.description = result.data.description
    this.events = result.data.events as EventName[]
    this.handler = result.data.handler as typeof props.handler
  }

  /** @internal */
  public getDefinition(): Definitions.TriggerDefinition {
    const definition: Definitions.TriggerDefinition = {
      type: 'trigger',
      name: this.name as string,
      events: this.events,
    }

    if (this.description !== undefined) {
      definition.description = this.description
    }

    return definition
  }
}
