// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListTagValuesRequestHeaders {}

export interface ListTagValuesRequestQuery {
  nextToken?: string;
  pageSize?: number;
  type: "user" | "conversation" | "message";
}

export interface ListTagValuesRequestParams {
  key: string;
}

export interface ListTagValuesRequestBody {}

export type ListTagValuesInput = ListTagValuesRequestBody & ListTagValuesRequestHeaders & ListTagValuesRequestQuery & ListTagValuesRequestParams

export type ListTagValuesRequest = {
  headers: ListTagValuesRequestHeaders;
  query: ListTagValuesRequestQuery;
  params: ListTagValuesRequestParams;
  body: ListTagValuesRequestBody;
}

export const parseReq = (input: ListTagValuesInput): ListTagValuesRequest & { path: string } => {
  return {
    path: `/v1/chat/tags/${encodeURIComponent(input['key'])}/values`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'type': input['type'] },
    params: { 'key': input['key'] },
    body: {  },
  }
}

export interface ListTagValuesResponse {
  tags: {
    value: string;
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

