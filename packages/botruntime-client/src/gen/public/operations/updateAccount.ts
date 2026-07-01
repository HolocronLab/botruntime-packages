// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpdateAccountRequestHeaders {}

export interface UpdateAccountRequestQuery {}

export interface UpdateAccountRequestParams {}

export interface UpdateAccountRequestBody {
  displayName?: string;
  profilePicture?: string;
  refresh?: boolean;
}

export type UpdateAccountInput = UpdateAccountRequestBody & UpdateAccountRequestHeaders & UpdateAccountRequestQuery & UpdateAccountRequestParams

export type UpdateAccountRequest = {
  headers: UpdateAccountRequestHeaders;
  query: UpdateAccountRequestQuery;
  params: UpdateAccountRequestParams;
  body: UpdateAccountRequestBody;
}

export const parseReq = (input: UpdateAccountInput): UpdateAccountRequest & { path: string } => {
  return {
    path: `/v1/admin/account/me`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'displayName': input['displayName'], 'profilePicture': input['profilePicture'], 'refresh': input['refresh'] },
  }
}

export interface UpdateAccountResponse {
  account: {
    id: string;
    email: string;
    displayName?: string;
    emailVerified: boolean;
    profilePicture?: string;
    /**
     * Creation date of the [Account](#schema_account) in ISO 8601 format
     */
    createdAt: string;
  };
}

