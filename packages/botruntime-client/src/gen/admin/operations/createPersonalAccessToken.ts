// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreatePersonalAccessTokenRequestHeaders {}

export interface CreatePersonalAccessTokenRequestQuery {}

export interface CreatePersonalAccessTokenRequestParams {}

export interface CreatePersonalAccessTokenRequestBody {
  /**
   * Note to identify the PAT
   */
  note: string;
}

export type CreatePersonalAccessTokenInput = CreatePersonalAccessTokenRequestBody & CreatePersonalAccessTokenRequestHeaders & CreatePersonalAccessTokenRequestQuery & CreatePersonalAccessTokenRequestParams

export type CreatePersonalAccessTokenRequest = {
  headers: CreatePersonalAccessTokenRequestHeaders;
  query: CreatePersonalAccessTokenRequestQuery;
  params: CreatePersonalAccessTokenRequestParams;
  body: CreatePersonalAccessTokenRequestBody;
}

export const parseReq = (input: CreatePersonalAccessTokenInput): CreatePersonalAccessTokenRequest & { path: string } => {
  return {
    path: `/v1/admin/account/pats`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'note': input['note'] },
  }
}

export interface CreatePersonalAccessTokenResponse {
  pat: {
    id: string;
    createdAt: string;
    note: string;
    /**
     * The PAT value. This will only be returned here when created and cannot be retrieved later.
     */
    value: string;
  };
}

