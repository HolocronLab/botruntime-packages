// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpdateWorkspaceRequestHeaders {}

export interface UpdateWorkspaceRequestQuery {}

export interface UpdateWorkspaceRequestParams {
  id: string;
}

export interface UpdateWorkspaceRequestBody {
  name?: string;
  spendingLimit?: number;
  about?: string;
  profilePicture?: string;
  contactEmail?: string;
  website?: string;
  /**
   * @maxItems 5
   */
  socialAccounts?: string[];
  isPublic?: boolean;
  handle?: string;
}

export type UpdateWorkspaceInput = UpdateWorkspaceRequestBody & UpdateWorkspaceRequestHeaders & UpdateWorkspaceRequestQuery & UpdateWorkspaceRequestParams

export type UpdateWorkspaceRequest = {
  headers: UpdateWorkspaceRequestHeaders;
  query: UpdateWorkspaceRequestQuery;
  params: UpdateWorkspaceRequestParams;
  body: UpdateWorkspaceRequestBody;
}

export const parseReq = (input: UpdateWorkspaceInput): UpdateWorkspaceRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'name': input['name'], 'spendingLimit': input['spendingLimit'], 'about': input['about'], 'profilePicture': input['profilePicture'], 'contactEmail': input['contactEmail'], 'website': input['website'], 'socialAccounts': input['socialAccounts'], 'isPublic': input['isPublic'], 'handle': input['handle'] },
  }
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

