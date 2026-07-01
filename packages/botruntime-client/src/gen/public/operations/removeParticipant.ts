// this file was automatically generated, do not edit
/* eslint-disable */

export interface RemoveParticipantRequestHeaders {}

export interface RemoveParticipantRequestQuery {}

export interface RemoveParticipantRequestParams {
  id: string;
  userId: string;
}

export interface RemoveParticipantRequestBody {}

export type RemoveParticipantInput = RemoveParticipantRequestBody & RemoveParticipantRequestHeaders & RemoveParticipantRequestQuery & RemoveParticipantRequestParams

export type RemoveParticipantRequest = {
  headers: RemoveParticipantRequestHeaders;
  query: RemoveParticipantRequestQuery;
  params: RemoveParticipantRequestParams;
  body: RemoveParticipantRequestBody;
}

export const parseReq = (input: RemoveParticipantInput): RemoveParticipantRequest & { path: string } => {
  return {
    path: `/v1/chat/conversations/${encodeURIComponent(input['id'])}/participants/${encodeURIComponent(input['userId'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'], 'userId': input['userId'] },
    body: {  },
  }
}

export interface RemoveParticipantResponse {}

