// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateConversationRequestHeaders {}

export interface CreateConversationRequestQuery {}

export interface CreateConversationRequestParams {}

export interface CreateConversationRequestBody {
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
}

export type CreateConversationInput = CreateConversationRequestBody & CreateConversationRequestHeaders & CreateConversationRequestQuery & CreateConversationRequestParams

export type CreateConversationRequest = {
  headers: CreateConversationRequestHeaders;
  query: CreateConversationRequestQuery;
  params: CreateConversationRequestParams;
  body: CreateConversationRequestBody;
}

export const parseReq = (input: CreateConversationInput): CreateConversationRequest & { path: string } => {
  return {
    path: `/v1/chat/conversations`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'channel': input['channel'], 'tags': input['tags'], 'integrationName': input['integrationName'], 'properties': input['properties'] },
  }
}

export interface CreateConversationResponse {
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
}

