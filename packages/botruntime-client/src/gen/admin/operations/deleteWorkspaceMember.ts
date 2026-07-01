// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteWorkspaceMemberRequestHeaders {}

export interface DeleteWorkspaceMemberRequestQuery {}

export interface DeleteWorkspaceMemberRequestParams {
  id: string;
}

export interface DeleteWorkspaceMemberRequestBody {}

export type DeleteWorkspaceMemberInput = DeleteWorkspaceMemberRequestBody & DeleteWorkspaceMemberRequestHeaders & DeleteWorkspaceMemberRequestQuery & DeleteWorkspaceMemberRequestParams

export type DeleteWorkspaceMemberRequest = {
  headers: DeleteWorkspaceMemberRequestHeaders;
  query: DeleteWorkspaceMemberRequestQuery;
  params: DeleteWorkspaceMemberRequestParams;
  body: DeleteWorkspaceMemberRequestBody;
}

export const parseReq = (input: DeleteWorkspaceMemberInput): DeleteWorkspaceMemberRequest & { path: string } => {
  return {
    path: `/v1/admin/workspace-members/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteWorkspaceMemberResponse {}

