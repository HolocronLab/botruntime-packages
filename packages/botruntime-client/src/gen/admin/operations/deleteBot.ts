// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteBotRequestHeaders {}

export interface DeleteBotRequestQuery {}

export interface DeleteBotRequestParams {
  id: string;
}

export interface DeleteBotRequestBody {}

export type DeleteBotInput = DeleteBotRequestBody & DeleteBotRequestHeaders & DeleteBotRequestQuery & DeleteBotRequestParams

export type DeleteBotRequest = {
  headers: DeleteBotRequestHeaders;
  query: DeleteBotRequestQuery;
  params: DeleteBotRequestParams;
  body: DeleteBotRequestBody;
}

export const parseReq = (input: DeleteBotInput): DeleteBotRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteBotResponse {}

