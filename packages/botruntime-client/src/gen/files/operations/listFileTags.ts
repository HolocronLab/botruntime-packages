// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListFileTagsRequestHeaders {}

export interface ListFileTagsRequestQuery {
  nextToken?: string;
  pageSize?: number;
}

export interface ListFileTagsRequestParams {}

export interface ListFileTagsRequestBody {}

export type ListFileTagsInput = ListFileTagsRequestBody & ListFileTagsRequestHeaders & ListFileTagsRequestQuery & ListFileTagsRequestParams

export type ListFileTagsRequest = {
  headers: ListFileTagsRequestHeaders;
  query: ListFileTagsRequestQuery;
  params: ListFileTagsRequestParams;
  body: ListFileTagsRequestBody;
}

export const parseReq = (input: ListFileTagsInput): ListFileTagsRequest & { path: string } => {
  return {
    path: `/v1/files/tags`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'] },
    params: {  },
    body: {  },
  }
}

export interface ListFileTagsResponse {
  tags: string[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

