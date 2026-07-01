// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateWorkspaceMemberRequestHeaders {}

export interface CreateWorkspaceMemberRequestQuery {}

export interface CreateWorkspaceMemberRequestParams {}

export interface CreateWorkspaceMemberRequestBody {
  email: string;
  role: "viewer" | "billing" | "developer" | "manager" | "administrator" | "owner";
  sendEmail?: boolean;
}

export type CreateWorkspaceMemberInput = CreateWorkspaceMemberRequestBody & CreateWorkspaceMemberRequestHeaders & CreateWorkspaceMemberRequestQuery & CreateWorkspaceMemberRequestParams

export type CreateWorkspaceMemberRequest = {
  headers: CreateWorkspaceMemberRequestHeaders;
  query: CreateWorkspaceMemberRequestQuery;
  params: CreateWorkspaceMemberRequestParams;
  body: CreateWorkspaceMemberRequestBody;
}

export const parseReq = (input: CreateWorkspaceMemberInput): CreateWorkspaceMemberRequest & { path: string } => {
  return {
    path: `/v1/admin/workspace-members`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'email': input['email'], 'role': input['role'], 'sendEmail': input['sendEmail'] },
  }
}

export interface CreateWorkspaceMemberResponse {
  id: string;
  userId?: string;
  email: string;
  createdAt: string;
  role: "viewer" | "billing" | "developer" | "manager" | "administrator" | "owner";
  profilePicture?: string;
  displayName?: string;
}

