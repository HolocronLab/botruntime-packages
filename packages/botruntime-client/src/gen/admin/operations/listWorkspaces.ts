// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListWorkspacesRequestHeaders {}

export interface ListWorkspacesRequestQuery {
  nextToken?: string;
  pageSize?: number;
  handle?: string;
}

export interface ListWorkspacesRequestParams {}

export interface ListWorkspacesRequestBody {}

export type ListWorkspacesInput = ListWorkspacesRequestBody & ListWorkspacesRequestHeaders & ListWorkspacesRequestQuery & ListWorkspacesRequestParams

export type ListWorkspacesRequest = {
  headers: ListWorkspacesRequestHeaders;
  query: ListWorkspacesRequestQuery;
  params: ListWorkspacesRequestParams;
  body: ListWorkspacesRequestBody;
}

export const parseReq = (input: ListWorkspacesInput): ListWorkspacesRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'handle': input['handle'] },
    params: {  },
    body: {  },
  }
}

export interface ListWorkspacesResponse {
  workspaces: UpdateWorkspaceResponse[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}
export interface UpdateWorkspaceResponse {
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

