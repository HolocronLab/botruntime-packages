// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetConversationRequestHeaders {}

export interface GetConversationRequestQuery {}

export interface GetConversationRequestParams {
  id: string;
}

export interface GetConversationRequestBody {}

export type GetConversationInput = GetConversationRequestBody & GetConversationRequestHeaders & GetConversationRequestQuery & GetConversationRequestParams

export type GetConversationRequest = {
  headers: GetConversationRequestHeaders;
  query: GetConversationRequestQuery;
  params: GetConversationRequestParams;
  body: GetConversationRequestBody;
}

export const parseReq = (input: GetConversationInput): GetConversationRequest & { path: string } => {
  return {
    path: `/v1/chat/conversations/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetConversationResponse {
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

