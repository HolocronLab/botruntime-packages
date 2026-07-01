// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListUsersRequestHeaders {}

export interface ListUsersRequestQuery {
  nextToken?: string;
  pageSize?: number;
  conversationId?: string;
  tags?: {
    [k: string]: string;
  };
  afterDate?: string;
  beforeDate?: string;
  rangeField?: "updatedAt" | "createdAt";
  sortField?: "updatedAt" | "createdAt";
  sortDirection?: "asc" | "desc";
}

export interface ListUsersRequestParams {}

export interface ListUsersRequestBody {}

export type ListUsersInput = ListUsersRequestBody & ListUsersRequestHeaders & ListUsersRequestQuery & ListUsersRequestParams

export type ListUsersRequest = {
  headers: ListUsersRequestHeaders;
  query: ListUsersRequestQuery;
  params: ListUsersRequestParams;
  body: ListUsersRequestBody;
}

export const parseReq = (input: ListUsersInput): ListUsersRequest & { path: string } => {
  return {
    path: `/v1/chat/users`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'conversationId': input['conversationId'], 'tags': input['tags'], 'afterDate': input['afterDate'], 'beforeDate': input['beforeDate'], 'rangeField': input['rangeField'], 'sortField': input['sortField'], 'sortDirection': input['sortDirection'] },
    params: {  },
    body: {  },
  }
}

export interface ListUsersResponse {
  users: {
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
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

