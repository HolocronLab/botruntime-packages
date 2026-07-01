// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetUserRequestHeaders {}

export interface GetUserRequestQuery {}

export interface GetUserRequestParams {
  id: string;
}

export interface GetUserRequestBody {}

export type GetUserInput = GetUserRequestBody & GetUserRequestHeaders & GetUserRequestQuery & GetUserRequestParams

export type GetUserRequest = {
  headers: GetUserRequestHeaders;
  query: GetUserRequestQuery;
  params: GetUserRequestParams;
  body: GetUserRequestBody;
}

export const parseReq = (input: GetUserInput): GetUserRequest & { path: string } => {
  return {
    path: `/v1/chat/users/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetUserResponse {
  /**
   * The user object represents someone interacting with the bot within a specific integration. The same person interacting with a bot in slack and messenger will be represented with two different users.
   */
  user: {
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

