// this file was automatically generated, do not edit
/* eslint-disable */

/**
 * The user object represents someone interacting with the bot within a specific integration. The same person interacting with a bot in slack and messenger will be represented with two different users.
 */
export interface User {
  /**
   * Id of the [User](#schema_user)
   */
  id: string;
  /**
   * Creation date of the [User](#schema_user) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Updating date of the [User](#schema_user) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Set of [Tags](/docs/developers/concepts/tags) that you can attach to a [User](#schema_user). The set of [Tags](/docs/developers/concepts/tags) available on a [User](#schema_user) is restricted by the list of [Tags](/docs/developers/concepts/tags) defined previously by the [Bot](#schema_bot). Individual keys can be unset by posting an empty value to them.
   */
  tags: {
    [k: string]: string;
  };
  /**
   * Name of the [User](#schema_user)
   */
  name?: string;
  /**
   * Picture URL of the [User](#schema_user)
   */
  pictureUrl?: string;
  /**
   * Optional properties
   */
  properties?: {
    [k: string]: string;
  };
  /**
   * Optional attributes
   */
  attributes?: {
    [k: string]: string;
  };
}

/**
 * The [Conversation](#schema_conversation) object represents an exchange of messages between one or more users. A [Conversation](#schema_conversation) is always linked to an integration's channels. For example, a Slack channel represents a conversation.
 */
export interface Conversation {
  /**
   * Id of the [Conversation](#schema_conversation)
   */
  id: string;
  /**
   * @deprecated
   * Unused. This field will be removed in the future.
   */
  currentTaskId?: string;
  /**
   * Creation date of the [Conversation](#schema_conversation) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Updating date of the [Conversation](#schema_conversation) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Name of the channel where the [Conversation](#schema_conversation) is happening
   */
  channel: string;
  /**
   * Name of the integration that created the [Conversation](#schema_conversation)
   */
  integration: string;
  /**
   * Set of [Tags](/docs/developers/concepts/tags) that you can attach to a [Conversation](#schema_conversation). The set of [Tags](/docs/developers/concepts/tags) available on a [Conversation](#schema_conversation) is restricted by the list of [Tags](/docs/developers/concepts/tags) defined previously by the [Bot](#schema_bot). Individual keys can be unset by posting an empty value to them.
   */
  tags: {
    [k: string]: string;
  };
  /**
   * Number of messages in the conversation
   */
  messageCount: number;
  /**
   * **EXPERIMENTAL** - Optional shared properties that can be accessed and modified by both the bot and any of its integrations.
   */
  properties?: {
    [k: string]: string;
  };
}

/**
 * The event object represents an action or an occurrence.
 */
export interface Event {
  /**
   * Id of the [Event](#schema_event)
   */
  id: string;
  /**
   * Creation date of the [Event](#schema_event) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Type of the [Event](#schema_event).
   */
  type: string;
  /**
   * Payload is the content of the event defined by the integration installed on your bot or one of the default events created by our api.
   */
  payload: {
    [k: string]: any;
  };
  /**
   * ID of the [Conversation](#schema_conversation) to link the event to.
   */
  conversationId?: string;
  /**
   * ID of the [User](#schema_user) to link the event to.
   */
  userId?: string;
  /**
   * ID of the [Message](#schema_message) to link the event to.
   */
  messageId?: string;
  status: "pending" | "processed" | "ignored" | "failed" | "scheduled" | "canceled";
  /**
   * Reason why the event failed to be processed
   */
  failureReason: string | null;
}

/**
 * The Message object represents a message in a [Conversation](#schema_conversation) for a specific [User](#schema_user).
 */
export interface Message {
  /**
   * Id of the [Message](#schema_message)
   */
  id: string;
  /**
   * Creation date of the [Message](#schema_message) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Update date of the [Message](#schema_message) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Type of the [Message](#schema_message) represents the resource type that the message is related to
   */
  type: string;
  /**
   * Payload is the content type of the message. Accepted payload options: Text, Image, Choice, Dropdown, Card, Carousel, File, Audio, Video, Location
   */
  payload: {
    [k: string]: any;
  };
  /**
   * Direction of the message (`incoming` or `outgoing`).
   */
  direction: "incoming" | "outgoing";
  /**
   * ID of the [User](#schema_user)
   */
  userId: string;
  /**
   * ID of the [Conversation](#schema_conversation)
   */
  conversationId: string;
  /**
   * Set of [Tags](/docs/developers/concepts/tags) that you can attach to a [Conversation](#schema_conversation). The set of [Tags](/docs/developers/concepts/tags) available on a [Conversation](#schema_conversation) is restricted by the list of [Tags](/docs/developers/concepts/tags) defined previously by the [Bot](#schema_bot). Individual keys can be unset by posting an empty value to them.
   */
  tags: {
    [k: string]: string;
  };
  /**
   * Origin of the message (`synthetic`).
   */
  origin?: "synthetic";
}

/**
 * The state object represents the current payload. A state is always linked to either a bot, a conversation or a user.
 */
export interface State {
  /**
   * Id of the [State](#schema_state)
   */
  id: string;
  /**
   * Creation date of the [State](#schema_state) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Updating date of the [State](#schema_state) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Id of the [Bot](#schema_bot)
   */
  botId: string;
  /**
   * Id of the [Conversation](#schema_conversation)
   */
  conversationId?: string;
  /**
   * Id of the [User](#schema_user)
   */
  userId?: string;
  /**
   * Name of the [State](#schema_state) which is declared inside the bot definition
   */
  name: string;
  /**
   * Type of the [State](#schema_state) represents the resource type (`conversation`, `user`, `bot`, `integration` or `workflow`) that the state is related to
   */
  type: "conversation" | "user" | "bot" | "integration" | "workflow";
  /**
   * Payload is the content of the state defined by your bot.
   */
  payload: {
    [k: string]: any;
  };
  /**
   * Expiry of the state in milliseconds. The state will expire if it is idle for the configured value. Absent if no expiry is set.
   */
  expiry?: number;
  /**
   * Expiration date of the ${ref.state} in ISO 8601 format. Absent if no expiry is set.
   */
  expiresAt?: string;
}

/**
 * Workflow definition
 */
export interface Workflow {
  /**
   * Id of the [Workflow](#schema_workflow)
   */
  id: string;
  /**
   * Name of the workflow
   */
  name: string;
  /**
   * Status of the [Workflow](#schema_workflow)
   */
  status: "pending" | "in_progress" | "failed" | "completed" | "listening" | "paused" | "timedout" | "cancelled";
  /**
   * Input provided to the [Workflow](#schema_workflow)
   */
  input: {
    [k: string]: any;
  };
  /**
   * Data returned by the [Workflow](#schema_workflow) output
   */
  output: {
    [k: string]: any;
  };
  /**
   * Parent [Workflow](#schema_workflow) id is the parent [Workflow](#schema_workflow) that created this [Workflow](#schema_workflow)
   */
  parentWorkflowId?: string;
  /**
   * Conversation id related to this [Workflow](#schema_workflow)
   */
  conversationId?: string;
  /**
   * User id related to this [Workflow](#schema_workflow)
   */
  userId?: string;
  /**
   * Creation date of the [Workflow](#schema_workflow) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Updating date of the [Workflow](#schema_workflow) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * The date when the [Workflow](#schema_workflow) completed in ISO 8601 format
   */
  completedAt?: string;
  /**
   * If the [Workflow](#schema_workflow) fails this is the reason behind it
   */
  failureReason?: string;
  /**
   * The timeout date when the [Workflow](#schema_workflow) will fail in the ISO 8601 format
   */
  timeoutAt: string;
  /**
   * Set of [Tags](/docs/developers/concepts/tags) that you can attach to a [Workflow](#schema_workflow). Individual keys can be unset by posting an empty value to them.
   */
  tags: {
    [k: string]: string;
  };
}

