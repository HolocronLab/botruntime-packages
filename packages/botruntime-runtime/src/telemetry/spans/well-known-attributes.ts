import { AttributeDefinition } from './factory'

/**
 * Type representing all well-known attribute names
 */
export type WellKnownAttributeName = keyof typeof WellKnownAttributes

export const WellKnownAttributes = {
  conversationId: {
    type: 'string',
    description: 'The current conversation the execution is part of',
    title: 'Conversation ID',
    default: '',
  },
  workflowId: {
    type: 'string',
    description: 'The current workflow the execution is part of',
    title: 'Workflow ID',
  },
  eventId: {
    type: 'string',
    description: 'The current incoming event the execution is part of',
    title: 'Workflow ID',
  },
  userId: {
    type: 'string',
    description: 'The user attached to the event/message of the execution',
    title: 'User ID',
  },
  messageId: {
    type: 'string',
    description: 'The message attached to the event/message of the execution',
    title: 'Message ID',
  },
  botId: {
    type: 'string',
    description: 'The bot running the execution',
    title: 'Bot ID',
  },
  parentWorkflowId: {
    type: 'string',
    description: 'The parent workflow the execution is part of',
    title: 'Parent Workflow ID',
  },
  'event.type': {
    type: 'string',
    description: 'The type of the event the execution is part of',
    title: 'Event Type',
  },
  'message.type': {
    type: 'string',
    description: 'The type of the message received',
    title: 'Message Type',
  },
  integration: {
    type: 'string',
    description: 'The integration originating the event',
    title: 'Integration',
  },
  channel: {
    type: 'string',
    description: 'The integration channel originating the event',
    title: 'Channel',
  },
  'action.name': {
    type: 'string',
    description: 'The name of the action being called',
    title: 'Action Name',
  },
  'event.payload': {
    type: 'json',
    description: 'The payload of the event received',
    title: 'Event Payload',
  },
  'message.payload': {
    type: 'json',
    description: 'The payload of the message received',
    title: 'Message Payload',
  },
  'trigger.name': {
    type: 'string',
    description: 'The name of the trigger being evaluated',
    title: 'Trigger Name',
  },
} as const satisfies Record<string, Omit<AttributeDefinition, 'required'>>
