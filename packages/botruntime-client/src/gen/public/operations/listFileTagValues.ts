// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListFileTagValuesRequestHeaders {}

export interface ListFileTagValuesRequestQuery {
  nextToken?: string;
  pageSize?: number;
}

export interface ListFileTagValuesRequestParams {
  tag: string;
}

export interface ListFileTagValuesRequestBody {}

export type ListFileTagValuesInput = ListFileTagValuesRequestBody & ListFileTagValuesRequestHeaders & ListFileTagValuesRequestQuery & ListFileTagValuesRequestParams

export type ListFileTagValuesRequest = {
  headers: ListFileTagValuesRequestHeaders;
  query: ListFileTagValuesRequestQuery;
  params: ListFileTagValuesRequestParams;
  body: ListFileTagValuesRequestBody;
}

export const parseReq = (input: ListFileTagValuesInput): ListFileTagValuesRequest & { path: string } => {
  return {
    path: `/v1/files/tags/${encodeURIComponent(input['tag'])}/values`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'] },
    params: { 'tag': input['tag'] },
    body: {  },
  }
}

export interface ListFileTagValuesResponse {
  values: string[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

