// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteConversationRequestHeaders {}

export interface DeleteConversationRequestQuery {}

export interface DeleteConversationRequestParams {
  id: string;
}

export interface DeleteConversationRequestBody {}

export type DeleteConversationInput = DeleteConversationRequestBody & DeleteConversationRequestHeaders & DeleteConversationRequestQuery & DeleteConversationRequestParams

export type DeleteConversationRequest = {
  headers: DeleteConversationRequestHeaders;
  query: DeleteConversationRequestQuery;
  params: DeleteConversationRequestParams;
  body: DeleteConversationRequestBody;
}

export const parseReq = (input: DeleteConversationInput): DeleteConversationRequest & { path: string } => {
  return {
    path: `/v1/chat/conversations/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteConversationResponse {}

