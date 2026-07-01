// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetPluginCodeRequestHeaders {}

export interface GetPluginCodeRequestQuery {}

export interface GetPluginCodeRequestParams {
  id: string;
  platform: "node" | "browser";
}

export interface GetPluginCodeRequestBody {}

export type GetPluginCodeInput = GetPluginCodeRequestBody & GetPluginCodeRequestHeaders & GetPluginCodeRequestQuery & GetPluginCodeRequestParams

export type GetPluginCodeRequest = {
  headers: GetPluginCodeRequestHeaders;
  query: GetPluginCodeRequestQuery;
  params: GetPluginCodeRequestParams;
  body: GetPluginCodeRequestBody;
}

export const parseReq = (input: GetPluginCodeInput): GetPluginCodeRequest & { path: string } => {
  return {
    path: `/v1/admin/plugins/${encodeURIComponent(input['id'])}/code/${encodeURIComponent(input['platform'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'], 'platform': input['platform'] },
    body: {  },
  }
}

export interface GetPluginCodeResponse {
  code: string;
}

