// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateBotApiKeyRequestHeaders {}

export interface CreateBotApiKeyRequestQuery {}

export interface CreateBotApiKeyRequestParams {}

export interface CreateBotApiKeyRequestBody {
  botId: string;
  note?: string;
}

export type CreateBotApiKeyInput = CreateBotApiKeyRequestBody & CreateBotApiKeyRequestHeaders & CreateBotApiKeyRequestQuery & CreateBotApiKeyRequestParams

export type CreateBotApiKeyRequest = {
  headers: CreateBotApiKeyRequestHeaders;
  query: CreateBotApiKeyRequestQuery;
  params: CreateBotApiKeyRequestParams;
  body: CreateBotApiKeyRequestBody;
}

export const parseReq = (input: CreateBotApiKeyInput): CreateBotApiKeyRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/baks`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'botId': input['botId'], 'note': input['note'] },
  }
}

export interface CreateBotApiKeyResponse {
  id: string;
  createdAt: string;
  note: string;
  /**
   * The BAK value. This will only be returned here when created and cannot be retrieved later.
   */
  value: string;
}

