import { Cognitive } from '@holocronlab/botruntime-cognitive'
import { span } from '../../telemetry/tracing'
import { getActiveConversationId } from './context'

export class InstrumentedCognitive extends Cognitive {
  constructor(...props: ConstructorParameters<typeof Cognitive>) {
    super(...props)
  }

  clone(): InstrumentedCognitive {
    return new InstrumentedCognitive({
      client: this.client,
      __experimental_beta: this._useBeta,
      maxRetries: this._maxRetries,
      timeout: this._timeoutMs,
      provider: this._provider,
    })
  }

  generateContent(
    input: Parameters<typeof Cognitive.prototype.generateContent>[0]
  ): ReturnType<typeof Cognitive.prototype.generateContent> {
    const conversationId = getActiveConversationId()

    // Parse model if it's in "provider:model" format

    let provider = 'unknown'
    let model = 'unknown'

    try {
      if (typeof input.model === 'string') {
        const modelParts = input.model.split(':')
        provider = modelParts[0]!
        model = modelParts[1] || input.model
      } else if (Array.isArray(input.model) && (input.model as string[]).length > 0) {
        const modelParts = (input.model[0] as string)?.split(':')
        provider = modelParts[0]!
        model = modelParts[1] || (input.model[0] as string)
      }
    } catch (err) {
      console.warn('Failed to parse model string', err)
    }

    return span(
      'cognitive.request',
      {
        'ai.model': model,
        'ai.provider': provider,
        'ai.temperature': input.temperature,
        'ai.max_tokens': input.maxTokens,
        'ai.top_p': input.topP,
        'ai.system_length': input.systemPrompt?.length || 0,
        'ai.messages_count': input.messages?.length || 0,
        'ai.input_length': input.messages?.reduce((acc, m) => acc + (m.content?.length || 0), 0) || 0,
        'ai.prompt_category': input.meta?.promptCategory,
        'ai.prompt_source': input.meta?.promptSource,
        'ai.instructions': input.systemPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- span attribute type mismatch
        'ai.tools': input.tools as any,
        ...(conversationId ? { conversationId } : {}),
      },
      async (s) => {
        const result = await super.generateContent({
          ...input,
          // Провайдер-кэш: гейтвей строит session_id sticky-роутинга из conversationId.
          conversationId: input.conversationId ?? conversationId,
        })

        // Set output attributes
        s.setAttribute('ai.cached', !!result.meta.cached)
        s.setAttribute('ai.input_tokens', result.meta.tokens.input || 0)
        s.setAttribute('ai.output_tokens', result.meta.tokens.output || 0)
        s.setAttribute('ai.cost_input', result.meta.cost.input || 0)
        s.setAttribute('ai.cost_output', result.meta.cost.output || 0)
        s.setAttribute('ai.cost', (result.meta.cost.input || 0) + (result.meta.cost.output || 0))

        // Update model info with the actual model used
        s.setAttribute('ai.model', result.meta.model.model)
        s.setAttribute('ai.provider', result.meta.model.integration)

        return result
      }
    )
  }
}
