// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListPublicWorkspacesRequestHeaders {}

export interface ListPublicWorkspacesRequestQuery {
  nextToken?: string;
  pageSize?: number;
  workspaceIds?: string[];
  search?: string;
}

export interface ListPublicWorkspacesRequestParams {}

export interface ListPublicWorkspacesRequestBody {}

export type ListPublicWorkspacesInput = ListPublicWorkspacesRequestBody & ListPublicWorkspacesRequestHeaders & ListPublicWorkspacesRequestQuery & ListPublicWorkspacesRequestParams

export type ListPublicWorkspacesRequest = {
  headers: ListPublicWorkspacesRequestHeaders;
  query: ListPublicWorkspacesRequestQuery;
  params: ListPublicWorkspacesRequestParams;
  body: ListPublicWorkspacesRequestBody;
}

export const parseReq = (input: ListPublicWorkspacesInput): ListPublicWorkspacesRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/public`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'workspaceIds': input['workspaceIds'], 'search': input['search'] },
    params: {  },
    body: {  },
  }
}

export interface ListPublicWorkspacesResponse {
  workspaces: GetPublicWorkspaceResponse[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
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

