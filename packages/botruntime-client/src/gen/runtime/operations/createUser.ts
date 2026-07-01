// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateUserRequestHeaders {}

export interface CreateUserRequestQuery {}

export interface CreateUserRequestParams {}

export interface CreateUserRequestBody {
  /**
   * Tags for the [User](#schema_user)
   */
  tags: {
    [k: string]: string;
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
   * **EXPERIMENTAL** - Optional shared properties that can be accessed and modified by both the bot and any of its integrations.
   */
  properties?: {
    [k: string]: string;
  };
  /**
   * @deprecated
   * DEPRECATED - Use properties instead.
   */
  attributes?: {
    [k: string]: string;
  };
}

export type CreateUserInput = CreateUserRequestBody & CreateUserRequestHeaders & CreateUserRequestQuery & CreateUserRequestParams

export type CreateUserRequest = {
  headers: CreateUserRequestHeaders;
  query: CreateUserRequestQuery;
  params: CreateUserRequestParams;
  body: CreateUserRequestBody;
}

export const parseReq = (input: CreateUserInput): CreateUserRequest & { path: string } => {
  return {
    path: `/v1/chat/users`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'tags': input['tags'], 'integrationName': input['integrationName'], 'name': input['name'], 'pictureUrl': input['pictureUrl'], 'properties': input['properties'], 'attributes': input['attributes'] },
  }
}

export interface CreateUserResponse {
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

