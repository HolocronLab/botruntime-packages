// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetOrSetStateRequestHeaders {}

export interface GetOrSetStateRequestQuery {}

export interface GetOrSetStateRequestParams {
  type: "conversation" | "user" | "bot" | "integration" | "workflow";
  id: string;
  name: string;
}

export interface GetOrSetStateRequestBody {
  /**
   * Payload is the content of the state defined by your bot.
   */
  payload: {
    [k: string]: any;
  };
  /**
   * Expiry of the [State](#schema_state) in milliseconds. The state will expire if it is idle for the configured value. By default, a state doesn't expire.
   */
  expiry?: number | null;
}

export type GetOrSetStateInput = GetOrSetStateRequestBody & GetOrSetStateRequestHeaders & GetOrSetStateRequestQuery & GetOrSetStateRequestParams

export type GetOrSetStateRequest = {
  headers: GetOrSetStateRequestHeaders;
  query: GetOrSetStateRequestQuery;
  params: GetOrSetStateRequestParams;
  body: GetOrSetStateRequestBody;
}

export const parseReq = (input: GetOrSetStateInput): GetOrSetStateRequest & { path: string } => {
  return {
    path: `/v1/chat/states/${encodeURIComponent(input['type'])}/${encodeURIComponent(input['id'])}/${encodeURIComponent(input['name'])}/get-or-set`,
    headers: {  },
    query: {  },
    params: { 'type': input['type'], 'id': input['id'], 'name': input['name'] },
    body: { 'payload': input['payload'], 'expiry': input['expiry'] },
  }
}

export interface GetOrSetStateResponse {
  /**
   * The state object represents the current payload. A state is always linked to either a bot, a conversation or a user.
   */
  state: {
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
  };
  meta: {
    cached: boolean;
  };
}

