// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetPublicWorkspaceRequestHeaders {}

export interface GetPublicWorkspaceRequestQuery {}

export interface GetPublicWorkspaceRequestParams {
  id: string;
}

export interface GetPublicWorkspaceRequestBody {}

export type GetPublicWorkspaceInput = GetPublicWorkspaceRequestBody & GetPublicWorkspaceRequestHeaders & GetPublicWorkspaceRequestQuery & GetPublicWorkspaceRequestParams

export type GetPublicWorkspaceRequest = {
  headers: GetPublicWorkspaceRequestHeaders;
  query: GetPublicWorkspaceRequestQuery;
  params: GetPublicWorkspaceRequestParams;
  body: GetPublicWorkspaceRequestBody;
}

export const parseReq = (input: GetPublicWorkspaceInput): GetPublicWorkspaceRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/${encodeURIComponent(input['id'])}/public`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetPublicWorkspaceResponse {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  about?: string;
  profilePicture?: string;
  contactEmail?: string;
  website?: string;
  socialAccounts?: string[];
  handle?: string;
}

