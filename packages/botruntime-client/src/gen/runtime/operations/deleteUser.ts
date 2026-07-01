// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteUserRequestHeaders {}

export interface DeleteUserRequestQuery {}

export interface DeleteUserRequestParams {
  id: string;
}

export interface DeleteUserRequestBody {}

export type DeleteUserInput = DeleteUserRequestBody & DeleteUserRequestHeaders & DeleteUserRequestQuery & DeleteUserRequestParams

export type DeleteUserRequest = {
  headers: DeleteUserRequestHeaders;
  query: DeleteUserRequestQuery;
  params: DeleteUserRequestParams;
  body: DeleteUserRequestBody;
}

export const parseReq = (input: DeleteUserInput): DeleteUserRequest & { path: string } => {
  return {
    path: `/v1/chat/users/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteUserResponse {}

