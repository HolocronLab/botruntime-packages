// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListConversationsRequestHeaders {}

export interface ListConversationsRequestQuery {
  nextToken?: string;
  pageSize?: number;
  sortField?: "createdAt" | "updatedAt";
  sortDirection?: "asc" | "desc";
  tags?: {
    [k: string]: string;
  };
  participantIds?: string[];
  integrationName?: string;
  channel?: string;
  afterDate?: string;
  beforeDate?: string;
  minMessageCount?: number;
  maxMessageCount?: number;
}

export interface ListConversationsRequestParams {}

export interface ListConversationsRequestBody {}

export type ListConversationsInput = ListConversationsRequestBody & ListConversationsRequestHeaders & ListConversationsRequestQuery & ListConversationsRequestParams

export type ListConversationsRequest = {
  headers: ListConversationsRequestHeaders;
  query: ListConversationsRequestQuery;
  params: ListConversationsRequestParams;
  body: ListConversationsRequestBody;
}

export const parseReq = (input: ListConversationsInput): ListConversationsRequest & { path: string } => {
  return {
    path: `/v1/chat/conversations`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'sortField': input['sortField'], 'sortDirection': input['sortDirection'], 'tags': input['tags'], 'participantIds': input['participantIds'], 'integrationName': input['integrationName'], 'channel': input['channel'], 'afterDate': input['afterDate'], 'beforeDate': input['beforeDate'], 'minMessageCount': input['minMessageCount'], 'maxMessageCount': input['maxMessageCount'] },
    params: {  },
    body: {  },
  }
}

export interface ListConversationsResponse {
  conversations: {
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
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

