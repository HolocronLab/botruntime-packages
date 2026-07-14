import { BaseConversationInstance } from './conversation-instance'
import type { Typings } from './conversation'

declare const wildcard: Typings.HandlerProps<'*'>
const wildcardTags: Record<string, string | undefined> = wildcard.conversation.tags
void wildcardTags
wildcard.conversation.send({ type: 'text', payload: { text: 'hello' } })

declare const preCodegenConversation: BaseConversationInstance
preCodegenConversation.send({ type: 'text', payload: { text: 'hello' } })
