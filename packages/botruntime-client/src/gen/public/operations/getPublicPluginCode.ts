// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetPublicPluginCodeRequestHeaders {}

export interface GetPublicPluginCodeRequestQuery {}

export interface GetPublicPluginCodeRequestParams {
  id: string;
  platform: "node" | "browser";
}

export interface GetPublicPluginCodeRequestBody {}

export type GetPublicPluginCodeInput = GetPublicPluginCodeRequestBody & GetPublicPluginCodeRequestHeaders & GetPublicPluginCodeRequestQuery & GetPublicPluginCodeRequestParams

export type GetPublicPluginCodeRequest = {
  headers: GetPublicPluginCodeRequestHeaders;
  query: GetPublicPluginCodeRequestQuery;
  params: GetPublicPluginCodeRequestParams;
  body: GetPublicPluginCodeRequestBody;
}

export const parseReq = (input: GetPublicPluginCodeInput): GetPublicPluginCodeRequest & { path: string } => {
  return {
    path: `/v1/admin/hub/plugins/${encodeURIComponent(input['id'])}/code/${encodeURIComponent(input['platform'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'], 'platform': input['platform'] },
    body: {  },
  }
}

export interface GetPublicPluginCodeResponse {
  code: string;
}

