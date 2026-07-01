// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetOrCreateConversationRequestHeaders {}

export interface GetOrCreateConversationRequestQuery {}

export interface GetOrCreateConversationRequestParams {}

export interface GetOrCreateConversationRequestBody {
  /**
   * Channel name
   */
  channel: string;
  /**
   * Tags for the [Conversation](#schema_conversation). Set to null or empty string to remove.
   */
  tags: {
    [k: string]: string | null;
  };
  /**
   * @deprecated
   * [DEPRECATED] To create a conversation from within a bot, call an action of the integration instead.
   */
  integrationName?: string;
  /**
   * **EXPERIMENTAL** - Optional shared properties. Set individual properties to null or empty string to remove them.
   */
  properties?: {
    [k: string]: string | null;
  };
  /**
   * Optional list of tag names to use for strict matching when looking up existing conversations. If provided, all specified tags must match exactly for a conversation to be considered a match. For example, with an existing conversation whose tags are {"foo": "a", "bar": "b", baz: "c"}: Without this parameter, ALL tags must match exactly. With ["bar","baz"], all listed tags must match their values, and other tags are not considered.
   */
  discriminateByTags?: string[];
}

export type GetOrCreateConversationInput = GetOrCreateConversationRequestBody & GetOrCreateConversationRequestHeaders & GetOrCreateConversationRequestQuery & GetOrCreateConversationRequestParams

export type GetOrCreateConversationRequest = {
  headers: GetOrCreateConversationRequestHeaders;
  query: GetOrCreateConversationRequestQuery;
  params: GetOrCreateConversationRequestParams;
  body: GetOrCreateConversationRequestBody;
}

export const parseReq = (input: GetOrCreateConversationInput): GetOrCreateConversationRequest & { path: string } => {
  return {
    path: `/v1/chat/conversations/get-or-create`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'channel': input['channel'], 'tags': input['tags'], 'integrationName': input['integrationName'], 'properties': input['properties'], 'discriminateByTags': input['discriminateByTags'] },
  }
}

export interface GetOrCreateConversationResponse {
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
  meta: {
    created: boolean;
  };
}

