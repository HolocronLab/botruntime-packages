// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetBotVersionRequestHeaders {}

export interface GetBotVersionRequestQuery {}

export interface GetBotVersionRequestParams {
  id: string;
  versionId: string;
}

export interface GetBotVersionRequestBody {}

export type GetBotVersionInput = GetBotVersionRequestBody & GetBotVersionRequestHeaders & GetBotVersionRequestQuery & GetBotVersionRequestParams

export type GetBotVersionRequest = {
  headers: GetBotVersionRequestHeaders;
  query: GetBotVersionRequestQuery;
  params: GetBotVersionRequestParams;
  body: GetBotVersionRequestBody;
}

export const parseReq = (input: GetBotVersionInput): GetBotVersionRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/versions/${encodeURIComponent(input['versionId'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'], 'versionId': input['versionId'] },
    body: {  },
  }
}

export interface GetBotVersionResponse {
  url: string;
}

