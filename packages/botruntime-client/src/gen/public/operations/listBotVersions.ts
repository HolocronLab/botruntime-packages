// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListBotVersionsRequestHeaders {}

export interface ListBotVersionsRequestQuery {}

export interface ListBotVersionsRequestParams {
  id: string;
}

export interface ListBotVersionsRequestBody {}

export type ListBotVersionsInput = ListBotVersionsRequestBody & ListBotVersionsRequestHeaders & ListBotVersionsRequestQuery & ListBotVersionsRequestParams

export type ListBotVersionsRequest = {
  headers: ListBotVersionsRequestHeaders;
  query: ListBotVersionsRequestQuery;
  params: ListBotVersionsRequestParams;
  body: ListBotVersionsRequestBody;
}

export const parseReq = (input: ListBotVersionsInput): ListBotVersionsRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/versions`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface ListBotVersionsResponse {
  versions: {
    id: string;
    name: string;
    description?: string;
  }[];
}

