// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetBotJsonRequestHeaders {}

export interface GetBotJsonRequestQuery {}

export interface GetBotJsonRequestParams {
  id: string;
}

export interface GetBotJsonRequestBody {}

export type GetBotJsonInput = GetBotJsonRequestBody & GetBotJsonRequestHeaders & GetBotJsonRequestQuery & GetBotJsonRequestParams

export type GetBotJsonRequest = {
  headers: GetBotJsonRequestHeaders;
  query: GetBotJsonRequestQuery;
  params: GetBotJsonRequestParams;
  body: GetBotJsonRequestBody;
}

export const parseReq = (input: GetBotJsonInput): GetBotJsonRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/bot-json`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetBotJsonResponse {
  [k: string]: any;
}

