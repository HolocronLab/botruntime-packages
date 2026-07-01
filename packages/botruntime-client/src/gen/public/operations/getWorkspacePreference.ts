// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetWorkspacePreferenceRequestHeaders {}

export interface GetWorkspacePreferenceRequestQuery {}

export interface GetWorkspacePreferenceRequestParams {
  key: string;
}

export interface GetWorkspacePreferenceRequestBody {}

export type GetWorkspacePreferenceInput = GetWorkspacePreferenceRequestBody & GetWorkspacePreferenceRequestHeaders & GetWorkspacePreferenceRequestQuery & GetWorkspacePreferenceRequestParams

export type GetWorkspacePreferenceRequest = {
  headers: GetWorkspacePreferenceRequestHeaders;
  query: GetWorkspacePreferenceRequestQuery;
  params: GetWorkspacePreferenceRequestParams;
  body: GetWorkspacePreferenceRequestBody;
}

export const parseReq = (input: GetWorkspacePreferenceInput): GetWorkspacePreferenceRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/preferences/${encodeURIComponent(input['key'])}`,
    headers: {  },
    query: {  },
    params: { 'key': input['key'] },
    body: {  },
  }
}

export interface GetWorkspacePreferenceResponse {
  value?: any;
}

