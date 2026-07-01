// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListEventsRequestHeaders {}

export interface ListEventsRequestQuery {
  nextToken?: string;
  pageSize?: number;
  type?: string;
  conversationId?: string;
  userId?: string;
  messageId?: string;
  workflowId?: string;
  status?: "pending" | "ignored" | "processed" | "failed" | "scheduled";
}

export interface ListEventsRequestParams {}

export interface ListEventsRequestBody {}

export type ListEventsInput = ListEventsRequestBody & ListEventsRequestHeaders & ListEventsRequestQuery & ListEventsRequestParams

export type ListEventsRequest = {
  headers: ListEventsRequestHeaders;
  query: ListEventsRequestQuery;
  params: ListEventsRequestParams;
  body: ListEventsRequestBody;
}

export const parseReq = (input: ListEventsInput): ListEventsRequest & { path: string } => {
  return {
    path: `/v1/chat/events`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'type': input['type'], 'conversationId': input['conversationId'], 'userId': input['userId'], 'messageId': input['messageId'], 'workflowId': input['workflowId'], 'status': input['status'] },
    params: {  },
    body: {  },
  }
}

export interface ListEventsResponse {
  events: {
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
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

