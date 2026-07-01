// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateWorkspaceRequestHeaders {}

export interface CreateWorkspaceRequestQuery {}

export interface CreateWorkspaceRequestParams {}

export interface CreateWorkspaceRequestBody {
  name: string;
  billingVersion?: "v4";
}

export type CreateWorkspaceInput = CreateWorkspaceRequestBody & CreateWorkspaceRequestHeaders & CreateWorkspaceRequestQuery & CreateWorkspaceRequestParams

export type CreateWorkspaceRequest = {
  headers: CreateWorkspaceRequestHeaders;
  query: CreateWorkspaceRequestQuery;
  params: CreateWorkspaceRequestParams;
  body: CreateWorkspaceRequestBody;
}

export const parseReq = (input: CreateWorkspaceInput): CreateWorkspaceRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'name': input['name'], 'billingVersion': input['billingVersion'] },
  }
}

export interface CreateWorkspaceResponse {
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

