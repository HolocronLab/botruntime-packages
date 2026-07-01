// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetParticipantRequestHeaders {}

export interface GetParticipantRequestQuery {}

export interface GetParticipantRequestParams {
  id: string;
  userId: string;
}

export interface GetParticipantRequestBody {}

export type GetParticipantInput = GetParticipantRequestBody & GetParticipantRequestHeaders & GetParticipantRequestQuery & GetParticipantRequestParams

export type GetParticipantRequest = {
  headers: GetParticipantRequestHeaders;
  query: GetParticipantRequestQuery;
  params: GetParticipantRequestParams;
  body: GetParticipantRequestBody;
}

export const parseReq = (input: GetParticipantInput): GetParticipantRequest & { path: string } => {
  return {
    path: `/v1/chat/conversations/${encodeURIComponent(input['id'])}/participants/${encodeURIComponent(input['userId'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'], 'userId': input['userId'] },
    body: {  },
  }
}

export interface GetParticipantResponse {
  /**
   * The user object represents someone interacting with the bot within a specific integration. The same person interacting with a bot in slack and messenger will be represented with two different users.
   */
  participant: {
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
}

