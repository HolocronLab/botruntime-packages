// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListParticipantsRequestHeaders {}

export interface ListParticipantsRequestQuery {
  nextToken?: string;
  pageSize?: number;
}

export interface ListParticipantsRequestParams {
  id: string;
}

export interface ListParticipantsRequestBody {}

export type ListParticipantsInput = ListParticipantsRequestBody & ListParticipantsRequestHeaders & ListParticipantsRequestQuery & ListParticipantsRequestParams

export type ListParticipantsRequest = {
  headers: ListParticipantsRequestHeaders;
  query: ListParticipantsRequestQuery;
  params: ListParticipantsRequestParams;
  body: ListParticipantsRequestBody;
}

export const parseReq = (input: ListParticipantsInput): ListParticipantsRequest & { path: string } => {
  return {
    path: `/v1/chat/conversations/${encodeURIComponent(input['id'])}/participants`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface ListParticipantsResponse {
  participants: {
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

