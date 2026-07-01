import { z, type InterfacePackage } from '@holocronlab/botruntime-sdk'

// Vendored equivalent of what `bp add` generates under bp_modules/typing-indicator from
// interfaces/typing-indicator. We do NOT run `bp add` (the SDK/CLI version pair in this repo is
// build-broken for codegen), so the InterfacePackage `IntegrationDefinition.extend()` consumes is
// hand-vendored here. Shape mirrors @botpress/sdk's InterfacePackage (package.d.ts) and the donor
// interface (interfaces/typing-indicator/interface.definition.ts: version 0.0.4, two actions whose
// input carries conversationId/messageId[/timeout], empty output).
const typingActionInput = z.object({
  conversationId: z.string().title('Conversation ID'),
  messageId: z.string().title('Message ID'),
  timeout: z.number().optional().title('Typing Indicator Timeout'),
})

const stopActionInput = z.object({
  conversationId: z.string().title('Conversation ID'),
  messageId: z.string().title('Message ID'),
})

const typingIndicator = {
  type: 'interface',
  name: 'typing-indicator',
  version: '0.0.4',
  definition: {
    name: 'typing-indicator',
    version: '0.0.4',
    entities: {},
    events: {},
    actions: {
      startTypingIndicator: {
        input: { schema: typingActionInput },
        output: { schema: z.object({}) },
      },
      stopTypingIndicator: {
        input: { schema: stopActionInput },
        output: { schema: z.object({}) },
      },
    },
  },
} satisfies InterfacePackage

export default typingIndicator
