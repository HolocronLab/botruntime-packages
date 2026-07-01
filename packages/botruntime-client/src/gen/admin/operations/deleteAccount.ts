// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteAccountRequestHeaders {}

export interface DeleteAccountRequestQuery {}

export interface DeleteAccountRequestParams {}

export interface DeleteAccountRequestBody {}

export type DeleteAccountInput = DeleteAccountRequestBody & DeleteAccountRequestHeaders & DeleteAccountRequestQuery & DeleteAccountRequestParams

export type DeleteAccountRequest = {
  headers: DeleteAccountRequestHeaders;
  query: DeleteAccountRequestQuery;
  params: DeleteAccountRequestParams;
  body: DeleteAccountRequestBody;
}

export const parseReq = (_: DeleteAccountInput): DeleteAccountRequest & { path: string } => {
  return {
    path: `/v1/admin/account/me`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface DeleteAccountResponse {}

