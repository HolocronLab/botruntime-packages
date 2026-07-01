import { transforms } from '@holocronlab/botruntime-zui'
import { z } from '@holocronlab/botruntime-sdk'
import { BotHandlers } from '@holocronlab/botruntime-sdk/dist/bot'
import { ZuiType } from '../types'
import { Autonomous } from '../runtime/autonomous'
import { context } from '../runtime/context/context'
import { Definitions } from './definition'

import { Defined } from '../utilities/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionHandler = Defined<BotHandlers<any>['actionHandlers'][string]>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionHandlerInput = ActionHandler extends (input: infer I) => Promise<any> ? I : never

export namespace Typings {
  export type ActionHandlerProps<TInput> = {
    input: TInput
    client: ActionHandlerInput['client']
  }

  export type Props<TInput extends ZuiType = ZuiType, TOutput extends ZuiType = ZuiType> = {
    name: string
    title?: string
    description?: string
    attributes?: Record<string, string>
    input: TInput
    output: TOutput
    cached?: boolean
    handler: (props: ActionHandlerProps<z.output<TInput>>) => Promise<z.infer<TOutput>>
  }

  export const Primitive = 'action' as const
}

export class BaseAction<TInput extends ZuiType, TOutput extends ZuiType> implements Definitions.Primitive {
  public readonly name: string
  public readonly title?: string
  public readonly description?: string
  public readonly attributes?: Record<string, string>
  public readonly input: TInput
  public readonly output: TOutput
  public readonly cached: boolean
  public readonly handler: (input: Typings.ActionHandlerProps<TInput>) => Promise<z.infer<TOutput>>

  constructor(props: Typings.Props<TInput, TOutput>) {
    // Validate name is alphanumeric only
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(props.name)) {
      throw new Error(`Action name "${props.name}" must be alphanumeric with no special characters or spaces`)
    }

    this.name = props.name
    if (props.title !== undefined) {
      this.title = props.title
    }
    if (props.description !== undefined) {
      this.description = props.description
    }
    if (props.attributes !== undefined) {
      this.attributes = props.attributes
    }
    this.input = props.input
    this.output = props.output
    this.cached = props.cached ?? false
    this.handler = props.handler
  }

  /** @internal */
  public getDefinition(): Definitions.ActionDefinition {
    const def: Definitions.ActionDefinition = {
      type: 'action',
      name: this.name,
    }

    if (this.title !== undefined) {
      def.title = this.title
    }
    if (this.description !== undefined) {
      def.description = this.description
    }
    if (this.input) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      def.input = transforms.toJSONSchema(this.input as any)
    }
    if (this.output) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      def.output = transforms.toJSONSchema(this.output as any)
    }
    if (this.cached !== undefined) {
      def.cached = this.cached
    }
    if (this.attributes !== undefined) {
      def.attributes = this.attributes
    }

    return def
  }

  /**
   * Convert this action into an Autonomous.Tool that can be used with execute().
   *
   * @param options.description - Optional description override for the tool
   * @returns An Autonomous.Tool instance
   *
   * @example
   * const tool = myAction.asTool()
   *
   * await execute({
   *   tools: [tool],
   *   instructions: 'Use the action when needed'
   * })
   */
  asTool(options?: { description?: string }) {
    const description = options?.description ?? this.description ?? `Runs the ${this.name} action`

    return new Autonomous.Tool({
      name: this.name,
      description,
      input: this.input,
      output: this.output,
      handler: async (input) => this.handler({ input, client: context.get('client') }),
    })
  }

  /**
   * Execute the action with input validation and output validation
   */
  public async execute({ input, client }: Pick<ActionHandlerInput, 'input' | 'client'>): Promise<z.infer<TOutput>> {
    const validatedInput = this.input.parse(input)
    const output = await this.handler({ input: validatedInput, client })
    return this.output.parse(output)
  }
}
