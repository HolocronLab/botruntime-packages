// this file was automatically generated, do not edit
/* eslint-disable */

export interface InitializeIncomingMessageRequestHeaders {}

export interface InitializeIncomingMessageRequestQuery {}

export interface InitializeIncomingMessageRequestParams {}

export interface InitializeIncomingMessageRequestBody {
  userId?: string;
  user?: {
    /**
     * Tags for the [User](#schema_user)
     */
    tags: {
      [k: string]: string;
    };
    /**
     * @deprecated
     * [DEPRECATED] To create a [User](#schema_user) from within a bot, call an action of the integration instead.
     */
    integrationName?: string;
    /**
     * Name of the user
     */
    name?: string;
    /**
     * URI of the user picture
     */
    pictureUrl?: string;
    /**
     * **EXPERIMENTAL** - Optional shared properties that can be accessed and modified by both the bot and any of its integrations.
     */
    properties?: {
      [k: string]: string;
    };
    /**
     * @deprecated
     * DEPRECATED - Use properties instead.
     */
    attributes?: {
      [k: string]: string;
    };
    /**
     * Optional list of tag names to use for strict matching when looking up existing messages. If provided, all specified tags must match exactly for a message to be considered a match. For example, with an existing message whose tags are {"foo": "a", "bar": "b", baz: "c"}: Without this parameter, ALL tags must match exactly. With ["bar","baz"], all listed tags must match their values, and other tags are not considered.
     */
    discriminateByTags: string[];
  };
  conversationId?: string;
  conversation?: {
    /**
     * Channel name
     */
    channel: string;
    /**
     * Tags for the [Conversation](#schema_conversation)
     */
    tags: {
      [k: string]: string;
    };
    /**
     * @deprecated
     * [DEPRECATED] To create a conversation from within a bot, call an action of the integration instead.
     */
    integrationName?: string;
    /**
     * **EXPERIMENTAL** - Optional shared properties that can be accessed and modified by both the bot and any of its integrations.
     */
    properties?: {
      [k: string]: string;
    };
    /**
     * Optional list of tag names to use for strict matching when looking up existing messages. If provided, all specified tags must match exactly for a message to be considered a match. For example, with an existing message whose tags are {"foo": "a", "bar": "b", baz: "c"}: Without this parameter, ALL tags must match exactly. With ["bar","baz"], all listed tags must match their values, and other tags are not considered.
     */
    discriminateByTags: string[];
  };
  message?: {
    /**
     * Payload is the content type of the message. Accepted payload options: Text, Image, Choice, Dropdown, Card, Carousel, File, Audio, Video, Location
     */
    payload: {
      [k: string]: any;
    };
    /**
     * Type of the [Message](#schema_message) represents the resource type that the message is related to
     */
    type: string;
    /**
     * Set of [Tags](/docs/developers/concepts/tags) that you can attach to a [Message](#schema_message). The set of [Tags](/docs/developers/concepts/tags) available on a [Message](#schema_message) is restricted by the list of [Tags](/docs/developers/concepts/tags) defined previously by the [Bot](#schema_bot). Individual keys can be unset by posting an empty value to them.
     */
    tags: {
      [k: string]: string;
    };
    origin?: "synthetic";
    /**
     * Optional list of tag names to use for strict matching when looking up existing messages. If provided, all specified tags must match exactly for a message to be considered a match. For example, with an existing message whose tags are {"foo": "a", "bar": "b", baz: "c"}: Without this parameter, ALL tags must match exactly. With ["bar","baz"], all listed tags must match their values, and other tags are not considered.
     */
    discriminateByTags: string[];
  };
}

export type InitializeIncomingMessageInput = InitializeIncomingMessageRequestBody & InitializeIncomingMessageRequestHeaders & InitializeIncomingMessageRequestQuery & InitializeIncomingMessageRequestParams

export type InitializeIncomingMessageRequest = {
  headers: InitializeIncomingMessageRequestHeaders;
  query: InitializeIncomingMessageRequestQuery;
  params: InitializeIncomingMessageRequestParams;
  body: InitializeIncomingMessageRequestBody;
}

export const parseReq = (input: InitializeIncomingMessageInput): InitializeIncomingMessageRequest & { path: string } => {
  return {
    path: `/v1/chat/initialize-incoming-message`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'userId': input['userId'], 'user': input['user'], 'conversationId': input['conversationId'], 'conversation': input['conversation'], 'message': input['message'] },
  }
}

export interface InitializeIncomingMessageResponse {
  /**
   * The user object represents someone interacting with the bot within a specific integration. The same person interacting with a bot in slack and messenger will be represented with two different users.
   */
  user: {
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
  };
  /**
   * The [Conversation](#schema_conversation) object represents an exchange of messages between one or more users. A [Conversation](#schema_conversation) is always linked to an integration's channels. For example, a Slack channel represents a conversation.
   */
  conversation: {
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
  };
  /**
   * The Message object represents a message in a [Conversation](#schema_conversation) for a specific [User](#schema_user).
   */
  message?: {
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
  };
}

