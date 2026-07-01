// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListPersonalAccessTokensRequestHeaders {}

export interface ListPersonalAccessTokensRequestQuery {}

export interface ListPersonalAccessTokensRequestParams {}

export interface ListPersonalAccessTokensRequestBody {}

export type ListPersonalAccessTokensInput = ListPersonalAccessTokensRequestBody & ListPersonalAccessTokensRequestHeaders & ListPersonalAccessTokensRequestQuery & ListPersonalAccessTokensRequestParams

export type ListPersonalAccessTokensRequest = {
  headers: ListPersonalAccessTokensRequestHeaders;
  query: ListPersonalAccessTokensRequestQuery;
  params: ListPersonalAccessTokensRequestParams;
  body: ListPersonalAccessTokensRequestBody;
}

export const parseReq = (_: ListPersonalAccessTokensInput): ListPersonalAccessTokensRequest & { path: string } => {
  return {
    path: `/v1/admin/account/pats`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface ListPersonalAccessTokensResponse {
  pats: {
    id: string;
    createdAt: string;
    note: string;
  }[];
}

