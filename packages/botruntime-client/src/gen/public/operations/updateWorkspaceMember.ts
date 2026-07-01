// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpdateWorkspaceMemberRequestHeaders {}

export interface UpdateWorkspaceMemberRequestQuery {}

export interface UpdateWorkspaceMemberRequestParams {
  id: string;
}

export interface UpdateWorkspaceMemberRequestBody {
  role?: "viewer" | "billing" | "developer" | "manager" | "administrator" | "owner";
}

export type UpdateWorkspaceMemberInput = UpdateWorkspaceMemberRequestBody & UpdateWorkspaceMemberRequestHeaders & UpdateWorkspaceMemberRequestQuery & UpdateWorkspaceMemberRequestParams

export type UpdateWorkspaceMemberRequest = {
  headers: UpdateWorkspaceMemberRequestHeaders;
  query: UpdateWorkspaceMemberRequestQuery;
  params: UpdateWorkspaceMemberRequestParams;
  body: UpdateWorkspaceMemberRequestBody;
}

export const parseReq = (input: UpdateWorkspaceMemberInput): UpdateWorkspaceMemberRequest & { path: string } => {
  return {
    path: `/v1/admin/workspace-members/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'role': input['role'] },
  }
}

export interface UpdateWorkspaceMemberResponse {
  id: string;
  userId?: string;
  email: string;
  createdAt: string;
  role: "viewer" | "billing" | "developer" | "manager" | "administrator" | "owner";
  profilePicture?: string;
  displayName?: string;
}

