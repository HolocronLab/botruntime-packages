// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListBotApiKeysRequestHeaders {}

export interface ListBotApiKeysRequestQuery {
  botId: string;
}

export interface ListBotApiKeysRequestParams {}

export interface ListBotApiKeysRequestBody {}

export type ListBotApiKeysInput = ListBotApiKeysRequestBody & ListBotApiKeysRequestHeaders & ListBotApiKeysRequestQuery & ListBotApiKeysRequestParams

export type ListBotApiKeysRequest = {
  headers: ListBotApiKeysRequestHeaders;
  query: ListBotApiKeysRequestQuery;
  params: ListBotApiKeysRequestParams;
  body: ListBotApiKeysRequestBody;
}

export const parseReq = (input: ListBotApiKeysInput): ListBotApiKeysRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/baks`,
    headers: {  },
    query: { 'botId': input['botId'] },
    params: {  },
    body: {  },
  }
}

export interface ListBotApiKeysResponse {
  baks: {
    id: string;
    createdAt: string;
    note: string;
  }[];
}

