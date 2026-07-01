// this file was automatically generated, do not edit
/* eslint-disable */

export interface SetAccountPreferenceRequestHeaders {}

export interface SetAccountPreferenceRequestQuery {}

export interface SetAccountPreferenceRequestParams {
  key: string;
}

export interface SetAccountPreferenceRequestBody {
  value?: any;
}

export type SetAccountPreferenceInput = SetAccountPreferenceRequestBody & SetAccountPreferenceRequestHeaders & SetAccountPreferenceRequestQuery & SetAccountPreferenceRequestParams

export type SetAccountPreferenceRequest = {
  headers: SetAccountPreferenceRequestHeaders;
  query: SetAccountPreferenceRequestQuery;
  params: SetAccountPreferenceRequestParams;
  body: SetAccountPreferenceRequestBody;
}

export const parseReq = (input: SetAccountPreferenceInput): SetAccountPreferenceRequest & { path: string } => {
  return {
    path: `/v1/admin/account/preferences/${encodeURIComponent(input['key'])}`,
    headers: {  },
    query: {  },
    params: { 'key': input['key'] },
    body: { 'value': input['value'] },
  }
}

export interface SetAccountPreferenceResponse {}

