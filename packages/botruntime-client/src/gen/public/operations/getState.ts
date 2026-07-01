// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetStateRequestHeaders {}

export interface GetStateRequestQuery {}

export interface GetStateRequestParams {
  type: "conversation" | "user" | "bot" | "integration" | "workflow";
  id: string;
  name: string;
}

export interface GetStateRequestBody {}

export type GetStateInput = GetStateRequestBody & GetStateRequestHeaders & GetStateRequestQuery & GetStateRequestParams

export type GetStateRequest = {
  headers: GetStateRequestHeaders;
  query: GetStateRequestQuery;
  params: GetStateRequestParams;
  body: GetStateRequestBody;
}

export const parseReq = (input: GetStateInput): GetStateRequest & { path: string } => {
  return {
    path: `/v1/chat/states/${encodeURIComponent(input['type'])}/${encodeURIComponent(input['id'])}/${encodeURIComponent(input['name'])}`,
    headers: {  },
    query: {  },
    params: { 'type': input['type'], 'id': input['id'], 'name': input['name'] },
    body: {  },
  }
}

export interface GetStateResponse {
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

