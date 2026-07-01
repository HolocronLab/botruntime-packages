// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteMessageRequestHeaders {}

export interface DeleteMessageRequestQuery {}

export interface DeleteMessageRequestParams {
  id: string;
}

export interface DeleteMessageRequestBody {}

export type DeleteMessageInput = DeleteMessageRequestBody & DeleteMessageRequestHeaders & DeleteMessageRequestQuery & DeleteMessageRequestParams

export type DeleteMessageRequest = {
  headers: DeleteMessageRequestHeaders;
  query: DeleteMessageRequestQuery;
  params: DeleteMessageRequestParams;
  body: DeleteMessageRequestBody;
}

export const parseReq = (input: DeleteMessageInput): DeleteMessageRequest & { path: string } => {
  return {
    path: `/v1/chat/messages/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteMessageResponse {}

