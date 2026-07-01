// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteWorkspaceRequestHeaders {}

export interface DeleteWorkspaceRequestQuery {}

export interface DeleteWorkspaceRequestParams {
  id: string;
}

export interface DeleteWorkspaceRequestBody {}

export type DeleteWorkspaceInput = DeleteWorkspaceRequestBody & DeleteWorkspaceRequestHeaders & DeleteWorkspaceRequestQuery & DeleteWorkspaceRequestParams

export type DeleteWorkspaceRequest = {
  headers: DeleteWorkspaceRequestHeaders;
  query: DeleteWorkspaceRequestQuery;
  params: DeleteWorkspaceRequestParams;
  body: DeleteWorkspaceRequestBody;
}

export const parseReq = (input: DeleteWorkspaceInput): DeleteWorkspaceRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteWorkspaceResponse {}

