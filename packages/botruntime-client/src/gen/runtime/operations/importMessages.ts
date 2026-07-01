// this file was automatically generated, do not edit
/* eslint-disable */

export interface ImportMessagesRequestHeaders {}

export interface ImportMessagesRequestQuery {}

export interface ImportMessagesRequestParams {}

export interface ImportMessagesRequestBody {
  /**
   * @maxItems 100
   */
  messages: {
    /**
     * Payload is the content type of the message. Accepted payload options: Text, Image, Choice, Dropdown, Card, Carousel, File, Audio, Video, Location
     */
    payload: {
      [k: string]: any;
    };
    /**
     * ID of the [User](#schema_user)
     */
    userId: string;
    /**
     * ID of the [Conversation](#schema_conversation)
     */
    conversationId: string;
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
    /**
     * Creation date of the [Message](#schema_message) in ISO 8601 format
     */
    createdAt: string;
    /**
     * Optional list of tag names to use for strict matching when looking up existing messages. If provided, all specified tags must match exactly for a message to be considered a match. For example, with an existing message whose tags are {"foo": "a", "bar": "b", baz: "c"}: Without this parameter, ALL tags must match exactly. With ["bar","baz"], all listed tags must match their values, and other tags are not considered.
     */
    discriminateByTags: string[];
  }[];
}

export type ImportMessagesInput = ImportMessagesRequestBody & ImportMessagesRequestHeaders & ImportMessagesRequestQuery & ImportMessagesRequestParams

export type ImportMessagesRequest = {
  headers: ImportMessagesRequestHeaders;
  query: ImportMessagesRequestQuery;
  params: ImportMessagesRequestParams;
  body: ImportMessagesRequestBody;
}

export const parseReq = (input: ImportMessagesInput): ImportMessagesRequest & { path: string } => {
  return {
    path: `/v1/chat/messages/import-messages`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'messages': input['messages'] },
  }
}

export interface ImportMessagesResponse {
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
}

