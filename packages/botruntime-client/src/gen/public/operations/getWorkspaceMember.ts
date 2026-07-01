// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetWorkspaceMemberRequestHeaders {}

export interface GetWorkspaceMemberRequestQuery {}

export interface GetWorkspaceMemberRequestParams {}

export interface GetWorkspaceMemberRequestBody {}

export type GetWorkspaceMemberInput = GetWorkspaceMemberRequestBody & GetWorkspaceMemberRequestHeaders & GetWorkspaceMemberRequestQuery & GetWorkspaceMemberRequestParams

export type GetWorkspaceMemberRequest = {
  headers: GetWorkspaceMemberRequestHeaders;
  query: GetWorkspaceMemberRequestQuery;
  params: GetWorkspaceMemberRequestParams;
  body: GetWorkspaceMemberRequestBody;
}

export const parseReq = (_: GetWorkspaceMemberInput): GetWorkspaceMemberRequest & { path: string } => {
  return {
    path: `/v1/admin/workspace-members/me`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface GetWorkspaceMemberResponse {
  id: string;
  userId?: string;
  email: string;
  createdAt: string;
  role: "viewer" | "billing" | "developer" | "manager" | "administrator" | "owner";
  profilePicture?: string;
  displayName?: string;
}

