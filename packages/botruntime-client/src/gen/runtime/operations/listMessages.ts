// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListMessagesRequestHeaders {}

export interface ListMessagesRequestQuery {
  nextToken?: string;
  pageSize?: number;
  conversationId?: string;
  tags?: {
    [k: string]: string;
  };
  afterDate?: string;
  beforeDate?: string;
}

export interface ListMessagesRequestParams {}

export interface ListMessagesRequestBody {}

export type ListMessagesInput = ListMessagesRequestBody & ListMessagesRequestHeaders & ListMessagesRequestQuery & ListMessagesRequestParams

export type ListMessagesRequest = {
  headers: ListMessagesRequestHeaders;
  query: ListMessagesRequestQuery;
  params: ListMessagesRequestParams;
  body: ListMessagesRequestBody;
}

export const parseReq = (input: ListMessagesInput): ListMessagesRequest & { path: string } => {
  return {
    path: `/v1/chat/messages`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'conversationId': input['conversationId'], 'tags': input['tags'], 'afterDate': input['afterDate'], 'beforeDate': input['beforeDate'] },
    params: {  },
    body: {  },
  }
}

export interface ListMessagesResponse {
  messages: {
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
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

