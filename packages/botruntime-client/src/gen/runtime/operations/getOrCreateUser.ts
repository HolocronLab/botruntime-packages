// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetOrCreateUserRequestHeaders {}

export interface GetOrCreateUserRequestQuery {}

export interface GetOrCreateUserRequestParams {}

export interface GetOrCreateUserRequestBody {
  /**
   * Tags for the user. Set to null or empty string to remove.
   */
  tags: {
    [k: string]: string | null;
  };
  /**
   * @deprecated
   * [DEPRECATED] To create a [User](#schema_user) from within a bot, call an action of the integration instead.
   */
  integrationName?: string;
  /**
   * Name of the user
   */
  name?: string;
  /**
   * URI of the user picture
   */
  pictureUrl?: string;
  /**
   * **EXPERIMENTAL** - Optional shared properties. Set individual properties to null or empty string to remove them.
   */
  properties?: {
    [k: string]: string | null;
  };
  /**
   * @deprecated
   * DEPRECATED - Use properties instead.
   */
  attributes?: {
    [k: string]: string | null;
  };
  /**
   * Optional list of tag names to use for strict matching when looking up existing users. If provided, all specified tags must match exactly for a user to be considered a match. For example, with an existing user whose tags are {"foo": "a", "bar": "b", baz: "c"}: Without this parameter, ALL tags must match exactly. With ["bar","baz"], all listed tags must match their values, and other tags are not considered.
   */
  discriminateByTags?: string[];
}

export type GetOrCreateUserInput = GetOrCreateUserRequestBody & GetOrCreateUserRequestHeaders & GetOrCreateUserRequestQuery & GetOrCreateUserRequestParams

export type GetOrCreateUserRequest = {
  headers: GetOrCreateUserRequestHeaders;
  query: GetOrCreateUserRequestQuery;
  params: GetOrCreateUserRequestParams;
  body: GetOrCreateUserRequestBody;
}

export const parseReq = (input: GetOrCreateUserInput): GetOrCreateUserRequest & { path: string } => {
  return {
    path: `/v1/chat/users/get-or-create`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'tags': input['tags'], 'integrationName': input['integrationName'], 'name': input['name'], 'pictureUrl': input['pictureUrl'], 'properties': input['properties'], 'attributes': input['attributes'], 'discriminateByTags': input['discriminateByTags'] },
  }
}

export interface GetOrCreateUserResponse {
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
  meta: {
    created: boolean;
  };
}

