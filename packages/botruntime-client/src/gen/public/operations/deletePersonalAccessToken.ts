// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeletePersonalAccessTokenRequestHeaders {}

export interface DeletePersonalAccessTokenRequestQuery {}

export interface DeletePersonalAccessTokenRequestParams {
  id: string;
}

export interface DeletePersonalAccessTokenRequestBody {}

export type DeletePersonalAccessTokenInput = DeletePersonalAccessTokenRequestBody & DeletePersonalAccessTokenRequestHeaders & DeletePersonalAccessTokenRequestQuery & DeletePersonalAccessTokenRequestParams

export type DeletePersonalAccessTokenRequest = {
  headers: DeletePersonalAccessTokenRequestHeaders;
  query: DeletePersonalAccessTokenRequestQuery;
  params: DeletePersonalAccessTokenRequestParams;
  body: DeletePersonalAccessTokenRequestBody;
}

export const parseReq = (input: DeletePersonalAccessTokenInput): DeletePersonalAccessTokenRequest & { path: string } => {
  return {
    path: `/v1/admin/account/pats/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeletePersonalAccessTokenResponse {}

