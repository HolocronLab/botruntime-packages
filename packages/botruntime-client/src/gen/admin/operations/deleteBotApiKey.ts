// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteBotApiKeyRequestHeaders {}

export interface DeleteBotApiKeyRequestQuery {}

export interface DeleteBotApiKeyRequestParams {
  id: string;
}

export interface DeleteBotApiKeyRequestBody {}

export type DeleteBotApiKeyInput = DeleteBotApiKeyRequestBody & DeleteBotApiKeyRequestHeaders & DeleteBotApiKeyRequestQuery & DeleteBotApiKeyRequestParams

export type DeleteBotApiKeyRequest = {
  headers: DeleteBotApiKeyRequestHeaders;
  query: DeleteBotApiKeyRequestQuery;
  params: DeleteBotApiKeyRequestParams;
  body: DeleteBotApiKeyRequestBody;
}

export const parseReq = (input: DeleteBotApiKeyInput): DeleteBotApiKeyRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/baks/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteBotApiKeyResponse {}

