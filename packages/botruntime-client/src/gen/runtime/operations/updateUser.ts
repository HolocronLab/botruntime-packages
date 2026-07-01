// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpdateUserRequestHeaders {}

export interface UpdateUserRequestQuery {}

export interface UpdateUserRequestParams {
  id: string;
}

export interface UpdateUserRequestBody {
  /**
   * Tags for the [User](#schema_user). Set to null or empty string to remove.
   */
  tags?: {
    [k: string]: string | null;
  };
  /**
   * Name of the user
   */
  name?: string | null;
  /**
   * URI of the user picture
   */
  pictureUrl?: string | null;
  /**
   * @deprecated
   * DEPRECATED - Use properties instead.
   */
  attributes?: {
    [k: string]: string | null;
  };
  /**
   * **EXPERIMENTAL** - Optional shared properties that can be accessed and modified by both the bot and any of its integrations. Set individual properties to null to remove them.
   */
  properties?: {
    [k: string]: string | null;
  };
}

export type UpdateUserInput = UpdateUserRequestBody & UpdateUserRequestHeaders & UpdateUserRequestQuery & UpdateUserRequestParams

export type UpdateUserRequest = {
  headers: UpdateUserRequestHeaders;
  query: UpdateUserRequestQuery;
  params: UpdateUserRequestParams;
  body: UpdateUserRequestBody;
}

export const parseReq = (input: UpdateUserInput): UpdateUserRequest & { path: string } => {
  return {
    path: `/v1/chat/users/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'tags': input['tags'], 'name': input['name'], 'pictureUrl': input['pictureUrl'], 'attributes': input['attributes'], 'properties': input['properties'] },
  }
}

export interface UpdateUserResponse {
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

