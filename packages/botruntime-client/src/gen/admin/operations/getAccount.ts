// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetAccountRequestHeaders {}

export interface GetAccountRequestQuery {}

export interface GetAccountRequestParams {}

export interface GetAccountRequestBody {}

export type GetAccountInput = GetAccountRequestBody & GetAccountRequestHeaders & GetAccountRequestQuery & GetAccountRequestParams

export type GetAccountRequest = {
  headers: GetAccountRequestHeaders;
  query: GetAccountRequestQuery;
  params: GetAccountRequestParams;
  body: GetAccountRequestBody;
}

export const parseReq = (_: GetAccountInput): GetAccountRequest & { path: string } => {
  return {
    path: `/v1/admin/account/me`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface GetAccountResponse {
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

