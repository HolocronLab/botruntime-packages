// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListWorkspaceMembersRequestHeaders {}

export interface ListWorkspaceMembersRequestQuery {
  nextToken?: string;
  pageSize?: number;
}

export interface ListWorkspaceMembersRequestParams {}

export interface ListWorkspaceMembersRequestBody {}

export type ListWorkspaceMembersInput = ListWorkspaceMembersRequestBody & ListWorkspaceMembersRequestHeaders & ListWorkspaceMembersRequestQuery & ListWorkspaceMembersRequestParams

export type ListWorkspaceMembersRequest = {
  headers: ListWorkspaceMembersRequestHeaders;
  query: ListWorkspaceMembersRequestQuery;
  params: ListWorkspaceMembersRequestParams;
  body: ListWorkspaceMembersRequestBody;
}

export const parseReq = (input: ListWorkspaceMembersInput): ListWorkspaceMembersRequest & { path: string } => {
  return {
    path: `/v1/admin/workspace-members`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'] },
    params: {  },
    body: {  },
  }
}

export interface ListWorkspaceMembersResponse {
  members: {
    id: string;
    userId?: string;
    email: string;
    createdAt: string;
    role: "viewer" | "billing" | "developer" | "manager" | "administrator" | "owner";
    profilePicture?: string;
    displayName?: string;
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

