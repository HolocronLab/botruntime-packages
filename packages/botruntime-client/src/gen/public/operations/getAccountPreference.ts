// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetAccountPreferenceRequestHeaders {}

export interface GetAccountPreferenceRequestQuery {}

export interface GetAccountPreferenceRequestParams {
  key: string;
}

export interface GetAccountPreferenceRequestBody {}

export type GetAccountPreferenceInput = GetAccountPreferenceRequestBody & GetAccountPreferenceRequestHeaders & GetAccountPreferenceRequestQuery & GetAccountPreferenceRequestParams

export type GetAccountPreferenceRequest = {
  headers: GetAccountPreferenceRequestHeaders;
  query: GetAccountPreferenceRequestQuery;
  params: GetAccountPreferenceRequestParams;
  body: GetAccountPreferenceRequestBody;
}

export const parseReq = (input: GetAccountPreferenceInput): GetAccountPreferenceRequest & { path: string } => {
  return {
    path: `/v1/admin/account/preferences/${encodeURIComponent(input['key'])}`,
    headers: {  },
    query: {  },
    params: { 'key': input['key'] },
    body: {  },
  }
}

export interface GetAccountPreferenceResponse {
  value?: any;
}

