import { IterationStatus } from '@holocronlab/botruntime-llmz'
import { GetSpanType, optional, required, SpanDefinition } from './factory'

type Name = Spans['name']
export type SpanOf<T extends Name> = Extract<Spans, { name: T }>
export type Spans = {
  [K in keyof typeof Spans]: GetSpanType<(typeof Spans)[K]>
}[keyof typeof Spans]

const IncomingRequestSpan = {
  name: 'request.incoming',
  importance: 'high',
  attributes: {
    ...optional('conversationId'),
    'request.operation': {
      type: 'enum',
      enum: ['register', 'event_received', 'ping', 'action_triggered'] as const,
      description: 'The operation being performed',
      title: 'Operation',
      required: true,
    },
    'request.type': {
      type: 'string',
      description: 'The request type (e.g., message_created)',
      title: 'Request Type',
    },
    'request.method': {
      type: 'enum',
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const,
      description: 'The HTTP method',
      title: 'HTTP Method',
      required: true,
    },
    'request.path': {
      type: 'string',
      description: 'The request path',
      title: 'Request Path',
      required: true,
    },
    botId: {
      type: 'string',
      description: 'The bot ID',
      title: 'Bot ID',
      required: true,
    },
    webhookId: {
      type: 'string',
      description: 'The webhook ID if applicable',
      title: 'Webhook ID',
    },
    'memory.rss': {
      type: 'number',
      description: 'The resident set size memory usage in bytes',
      title: 'Memory RSS (bytes)',
    },
    'memory.heapTotal': {
      type: 'number',
      description: 'The total heap size memory usage in bytes',
      title: 'Memory Heap Total (bytes)',
    },
    'cpu.count': {
      type: 'number',
      description: 'The number of CPU cores',
      title: 'CPU Count',
      required: true,
    },
    'requests.total': {
      type: 'number',
      description: 'The total number of requests handled by the process',
      title: 'Total Requests',
      required: true,
    },
    'message.preview': {
      type: 'string',
      description: 'Preview of the message text for message_created events',
      title: 'Message Preview',
    },
  },
} as const satisfies SpanDefinition

const CognitiveSpan = {
  name: 'cognitive.request',
  importance: 'high',
  attributes: {
    ...optional('conversationId'),
    'ai.model': {
      type: 'string',
      description: 'The AI model used for the request',
      title: 'AI Model',
    },
    'ai.provider': {
      type: 'string',
      description: 'The AI provider used for the request',
      title: 'AI Provider',
    },
    'ai.temperature': {
      type: 'number',
      description: 'The temperature setting for the AI model',
      title: 'AI Temperature',
    },
    'ai.max_tokens': {
      type: 'number',
      description: 'The maximum number of tokens to generate',
      title: 'AI Max Tokens',
    },
    'ai.top_p': {
      type: 'number',
      description: 'The top_p (nucleus sampling) parameter',
      title: 'AI Top P',
    },
    'ai.system_length': {
      type: 'number',
      description: 'The length of the system prompt in characters',
      title: 'AI System Prompt Length',
    },
    'ai.messages_count': {
      type: 'number',
      description: 'The number of messages in the conversation',
      title: 'AI Messages Count',
    },
    'ai.input_length': {
      type: 'number',
      description: 'The total length of input messages in characters',
      title: 'AI Input Length',
    },
    'ai.input_tokens': {
      type: 'number',
      description: 'The number of input tokens used for the request',
      title: 'AI Input Tokens',
    },
    'ai.output_tokens': {
      type: 'number',
      description: 'The number of output tokens used for the request',
      title: 'AI Output Tokens',
    },
    'ai.cost_input': {
      type: 'number',
      description: 'The cost of input tokens in USD',
      title: 'AI Input Cost (USD)',
    },
    'ai.cost_output': {
      type: 'number',
      description: 'The cost of output tokens in USD',
      title: 'AI Output Cost (USD)',
    },
    'ai.cost': {
      type: 'number',
      description: 'The total cost of the request in USD',
      title: 'AI Cost (USD)',
    },
    'ai.cached': {
      type: 'boolean',
      description: 'Whether the response was served from cache',
      title: 'AI Cached',
    },
    'ai.prompt_category': {
      type: 'string',
      description: 'The category of the prompt',
      title: 'AI Prompt Category',
    },
    'ai.prompt_source': {
      type: 'string',
      description: 'The source of the prompt',
      title: 'AI Prompt Source',
    },
    'ai.instructions': {
      type: 'string',
      description: 'The system prompt/instructions for the AI model',
      title: 'AI Instructions',
    },
    'ai.tools': {
      type: 'json',
      description: 'The tools available to the AI model',
      title: 'AI Tools',
    },
  },
} as const satisfies SpanDefinition

const BotpressClientSpan = {
  name: 'botpress.client',
  importance: 'medium',
  attributes: {
    'botpress.method': {
      type: 'enum',
      enum: ['GET', 'POST', 'PUT', 'OPTIONS', 'DELETE'] as const,
      required: true,
    },
    'botpress.url': { type: 'string' },
    'botpress.status_code': { type: 'number', default: '' },
    'botpress.duration_ms': { type: 'number' },
    'botpress.error': { type: 'string' },
    'botpress.via': { type: 'string' },
    'botpress.request.body': { type: 'string' },
    'botpress.response.body': { type: 'string' },
    'trace.traceparent': { type: 'string' },
    ...optional('conversationId', 'messageId', 'workflowId', 'userId', 'eventId', 'action.name'),
  },
} as const satisfies SpanDefinition

const HttpSpan = {
  name: 'http.client',
  importance: 'medium',
  attributes: {
    'http.method': {
      type: 'enum',
      enum: ['GET', 'POST', 'PUT', 'OPTIONS', 'DELETE'] as const,
      required: true,
    },
    'http.url': { type: 'string', required: true },
    'http.query': { type: 'json' },
    'http.request.headers': { type: 'json' },
    'http.response.headers': { type: 'json' },
    'http.request.body': { type: 'string' },
    'http.response.body': { type: 'string' },
    'http.status_code': { type: 'number' },
    'http.error': { type: 'string' },
    'http.via': {
      type: 'enum',
      enum: ['http', 'undici'] as const,
      required: true,
    },
    'trace.traceparent': { type: 'string' },
  },
} as const satisfies SpanDefinition

const ConversationHandlerSpan = {
  name: 'handler.conversation',
  importance: 'high',
  attributes: {
    ...required('botId', 'conversationId', 'eventId', 'integration', 'channel', 'event.type'),
    ...optional('messageId', 'userId', 'event.payload', 'message.payload', 'message.type'),
    'handler.matched': {
      type: 'boolean',
      description: 'False when no agent conversation matched the incoming channel and the message was skipped',
      title: 'Handler Matched',
    },
  },
} as const satisfies SpanDefinition

const TriggerHandlerSpan = {
  name: 'handler.trigger',
  importance: 'high',
  attributes: {
    ...required('botId', 'eventId', 'event.type'),
    ...optional(
      'conversationId',
      'messageId',
      'userId',
      'integration',
      'channel',
      'workflowId',
      'parentWorkflowId',
      'trigger.name'
    ),
  },
} as const satisfies SpanDefinition

const EventHandlerSpan = {
  name: 'handler.event',
  importance: 'high',
  attributes: {
    ...required('botId', 'eventId', 'event.type'),
    ...optional('conversationId', 'messageId', 'userId', 'integration', 'channel', 'workflowId', 'parentWorkflowId'),
  },
} as const satisfies SpanDefinition

const WorkflowHandlerSpan = {
  name: 'handler.workflow',
  importance: 'high',
  attributes: {
    ...required('botId', 'workflowId', 'eventId', 'event.type'),
    ...optional('messageId', 'userId', 'integration', 'channel', 'conversationId', 'parentWorkflowId'),
    'workflow.name': { type: 'string' },
    'workflow.status.initial': {
      type: 'enum',
      enum: ['pending', 'in_progress', 'listening', 'paused', 'completed', 'failed', 'timedout', 'cancelled'] as const,
    },
    'workflow.status.final': {
      type: 'enum',
      enum: ['continue', 'completed', 'failed'] as const,
    },
  },
} as const satisfies SpanDefinition

const WorkflowStepSpan = {
  name: 'handler.workflow.step',
  importance: 'high',
  attributes: {
    ...required('workflowId'),
    'workflow.step': { type: 'string', required: true },
    'workflow.step.type': { type: 'string', required: true },
    'workflow.step.attempt': { type: 'number', required: true },
    'workflow.step.output': { type: 'json' },
    'workflow.step.max_attempts': { type: 'number' },
    'workflow.step.error': { type: 'string' },
    'workflow.step.cached': {
      type: 'boolean',
      description: 'True when this step was served from cache (skipped re-execution on replay)',
    },
    // Map-specific attributes
    'workflow.map.total': { type: 'number', description: 'Total number of items to process in map' },
    'workflow.map.concurrency': { type: 'number', description: 'Concurrency level for map operation' },
    'workflow.map.item_index': { type: 'number', description: 'Index of item in map operation' },
  },
} as const satisfies SpanDefinition

const ActionHandlerSpan = {
  name: 'handler.action',
  importance: 'high',
  attributes: {
    ...required('botId'),
    'action.name': { type: 'string', required: true },
    'action.input': { type: 'json', required: true },
  },
} as const satisfies SpanDefinition

const AutonomousExecutionSpan = {
  name: 'autonomous.execution',
  importance: 'high',
  attributes: {
    ...optional('conversationId'),
    'autonomous.max_loops': {
      type: 'number',
      title: 'Max Loops',
      description: 'The maximum number of loops allowed',
      required: true,
    },
    'autonomous.mode': {
      type: 'enum',
      title: 'Mode',
      description: 'The mode LLMz is running in (chat or worker)',
      enum: ['chat', 'worker'] as const,
      required: true,
    },
    'autonomous.message_types': {
      type: 'json',
      title: 'Message Types',
      description: 'The types of messages LLMz can send',
    },
    'autonomous.iterations': {
      type: 'number',
      title: 'Iterations',
      description: 'The number of iterations performed',
    },
    'autonomous.execution_id': {
      type: 'string',
      title: 'Execution ID',
      description: 'The unique ID for this execution',
    },
  },
} as const satisfies SpanDefinition

const AutonomousIterationSpan = {
  name: 'autonomous.iteration',
  importance: 'high',
  attributes: {
    ...optional('conversationId'),
    'autonomous.iteration': {
      type: 'number',
      title: 'Iteration',
      description: 'The current iteration number',
      required: true,
    },
    'autonomous.instructions': {
      type: 'string',
      title: 'Instructions',
      description: 'The instructions provided to the agent',
    },
    'autonomous.exits': {
      type: 'json',
      title: 'Exits',
      description: 'The possible exit points for the agent',
    },
    'autonomous.code': {
      type: 'string',
      title: 'Code',
      description: 'The code generated in this iteration',
    },
    'autonomous.tools': {
      type: 'json',
      title: 'Tools',
      description: 'The tools available to the agent',
    },
    'autonomous.thoughts': {
      type: 'string',
      title: 'Thoughts',
      description: 'The thoughts generated in this iteration',
    },
    'autonomous.status': {
      type: 'enum',
      enum: [
        'pending',
        'generation_error',
        'execution_error',
        'invalid_code_error',
        'thinking_requested',
        'callback_requested',
        'exit_success',
        'exit_error',
        'aborted',
      ] as const satisfies IterationStatus['type'][],
      title: 'Error Type',
      description: 'The type of error encountered, if any',
    },
    'autonomous.error': {
      type: 'string',
      title: 'Error Message',
      description: 'The error message, if any',
    },
    'autonomous.exit.name': {
      type: 'string',
      title: 'Exit Name',
      description: 'The name of the exit point if exiting',
    },
    'autonomous.exit.value': {
      type: 'json',
      title: 'Exit Value',
      description: 'The value returned upon exit',
    },
    'ai.model': {
      type: 'string',
      title: 'AI Model',
      description: 'The AI model used for this iteration',
    },
    'ai.tokens': {
      type: 'number',
      title: 'Input Tokens',
      description: 'Number of input tokens used',
    },
    'ai.cost': {
      type: 'number',
      title: 'Cost',
      description: 'Total cost of this iteration in USD',
    },
  },
} as const satisfies SpanDefinition

const AutonomousToolSpan = {
  name: 'autonomous.tool',
  importance: 'high',
  attributes: {
    ...optional('conversationId'),
    'autonomous.tool.object': {
      type: 'string',
      title: 'Object Name',
      description: 'The name of the object being used',
      required: false,
    },
    'autonomous.tool.name': {
      type: 'string',
      title: 'Tool Name',
      description: 'The name of the tool being used',
      required: true,
    },
    'autonomous.tool.input': {
      type: 'json',
      title: 'Tool Input',
      description: 'The input provided to the tool',
    },
    'autonomous.tool.output': {
      type: 'string',
      title: 'Tool Output',
      description: 'The output returned by the tool (JSON for success, string for ThinkSignal)',
    },
    'autonomous.tool.status': {
      type: 'enum',
      enum: ['think', 'success', 'error'] as const,
      title: 'Tool Status',
      description: 'The status of the tool execution',
    },
    'autonomous.tool.error': {
      type: 'string',
      title: 'Tool Error',
      description: 'The error message if the tool failed',
    },
  },
} as const satisfies SpanDefinition

const InterruptionCheckSpan = {
  name: 'interruption.check',
  importance: 'medium',
  attributes: {
    ...required('conversationId'),
    'interruption.detected': {
      type: 'boolean',
      title: 'Interruption Detected',
      description: 'Whether an interruption was detected',
    },
    'interruption.events_count': {
      type: 'number',
      title: 'New Events Count',
      description: 'The number of new events detected',
    },
    'interruption.event_ids': {
      type: 'json',
      title: 'New Event IDs',
      description: 'The IDs of the new events that caused the interruption',
    },
  },
} as const satisfies SpanDefinition

const ChatFetchTranscriptSpan = {
  name: 'chat.fetchTranscript',
  importance: 'medium',
  attributes: {
    ...required('conversationId'),
  },
} as const satisfies SpanDefinition

const ChatCompactTranscriptSpan = {
  name: 'chat.compactTranscript',
  importance: 'medium',
  attributes: {
    ...required('conversationId'),
  },
} as const satisfies SpanDefinition

const ChatSaveTranscriptSpan = {
  name: 'chat.saveTranscript',
  importance: 'medium',
  attributes: {
    ...required('conversationId'),
  },
} as const satisfies SpanDefinition

const ChatSendMessageSpan = {
  name: 'chat.sendMessage',
  importance: 'high',
  attributes: {
    ...required('conversationId'),
    ...optional('messageId', 'integration', 'channel', 'userId', 'botId'),
    'message.type': {
      type: 'string',
      description: 'The type of message being sent',
      title: 'Message Type',
    },
    direction: {
      type: 'enum',
      enum: ['incoming', 'outgoing'] as const,
      description: 'The direction of the message',
      title: 'Direction',
    },
    'message.preview': {
      type: 'string',
      description: 'Preview of the message text content',
      title: 'Message Preview',
    },
  },
} as const satisfies SpanDefinition

const TrackedStateLoadSpan = {
  name: 'state.load',
  importance: 'medium',
  attributes: {
    type: {
      type: 'enum',
      enum: ['bot', 'user', 'conversation', 'workflow'] as const,
      description: 'The type of state being loaded',
      title: 'State Type',
      required: true,
    },
    name: {
      type: 'string',
      description: 'The name of the state',
      title: 'State Name',
      required: true,
    },
    location: {
      type: 'enum',
      enum: ['state', 'file'] as const,
      description: 'Where the state is stored',
      title: 'Storage Location',
    },
    has_value: {
      type: 'boolean',
      description: 'Whether the state has a value',
      title: 'Has Value',
    },
    'state.value': {
      type: 'json',
      description: 'The loaded state value',
      title: 'State Value',
    },
  },
} as const satisfies SpanDefinition

const TrackedStateSaveSpan = {
  name: 'state.save',
  importance: 'medium',
  attributes: {
    ...optional('conversationId'),
    type: {
      type: 'enum',
      enum: ['bot', 'user', 'conversation', 'workflow'] as const,
      description: 'The type of state being saved',
      title: 'State Type',
      required: true,
    },
    name: {
      type: 'string',
      description: 'The name of the state',
      title: 'State Name',
      required: true,
    },
    state_size_bytes: {
      type: 'number',
      description: 'The size of the state in bytes',
      title: 'State Size (bytes)',
    },
    swapped_to_file: {
      type: 'boolean',
      description: 'Whether the state was swapped to a file',
      title: 'Swapped to File',
    },
    'state.value': {
      type: 'json',
      description: 'The state value after saving',
      title: 'State Value',
    },
    'state.previous_value': {
      type: 'json',
      description: 'The state value before the change',
      title: 'Previous Value',
    },
    'state.changed_keys': {
      type: 'json',
      description: 'Top-level keys that changed',
      title: 'Changed Keys',
    },
  },
} as const satisfies SpanDefinition

const TrackedStateSaveAllDirtySpan = {
  name: 'state.saveAllDirty',
  importance: 'medium',
  attributes: {
    ...optional('conversationId'),
    states_count: {
      type: 'number',
      description: 'The number of dirty states being saved',
      title: 'States Count',
      required: true,
    },
    states: {
      type: 'json',
      description: 'The list of states being saved (type/id/name)',
      title: 'States',
    },
  },
} as const satisfies SpanDefinition

const TrackedStateLoadAllSpan = {
  name: 'state.loadAll',
  importance: 'medium',
  attributes: {},
} as const satisfies SpanDefinition

export const Spans = {
  IncomingRequestSpan,
  CognitiveSpan,
  HttpSpan,
  BotpressClientSpan,
  ConversationHandlerSpan,
  TriggerHandlerSpan,
  WorkflowHandlerSpan,
  WorkflowStepSpan,
  ActionHandlerSpan,
  EventHandlerSpan,
  AutonomousExecutionSpan,
  AutonomousIterationSpan,
  AutonomousToolSpan,
  InterruptionCheckSpan,
  ChatFetchTranscriptSpan,
  ChatCompactTranscriptSpan,
  ChatSaveTranscriptSpan,
  ChatSendMessageSpan,
  TrackedStateLoadSpan,
  TrackedStateSaveSpan,
  TrackedStateSaveAllDirtySpan,
  TrackedStateLoadAllSpan,
} as const

// Re-export types for convenience
export type { WellKnownAttributeName } from './well-known-attributes'
export type { SpanImportanceLevel } from './factory'
