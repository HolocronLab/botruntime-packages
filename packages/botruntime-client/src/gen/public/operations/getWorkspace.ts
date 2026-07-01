// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetWorkspaceRequestHeaders {}

export interface GetWorkspaceRequestQuery {}

export interface GetWorkspaceRequestParams {
  id: string;
}

export interface GetWorkspaceRequestBody {}

export type GetWorkspaceInput = GetWorkspaceRequestBody & GetWorkspaceRequestHeaders & GetWorkspaceRequestQuery & GetWorkspaceRequestParams

export type GetWorkspaceRequest = {
  headers: GetWorkspaceRequestHeaders;
  query: GetWorkspaceRequestQuery;
  params: GetWorkspaceRequestParams;
  body: GetWorkspaceRequestBody;
}

export const parseReq = (input: GetWorkspaceInput): GetWorkspaceRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetWorkspaceResponse {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  botCount: number;
  billingVersion: "v1" | "v2" | "v3" | "v4";
  plan: "community" | "team" | "enterprise" | "plus" | "managed";
  blocked: boolean;
  spendingLimit: number;
  about?: string;
  profilePicture?: string;
  contactEmail?: string;
  website?: string;
  socialAccounts?: string[];
  isPublic?: boolean;
  handle?: string;
  activeTrialId: string | null;
}

