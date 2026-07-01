// this file was automatically generated, do not edit
/* eslint-disable */

export interface SetWorkspacePreferenceRequestHeaders {}

export interface SetWorkspacePreferenceRequestQuery {}

export interface SetWorkspacePreferenceRequestParams {
  key: string;
}

export interface SetWorkspacePreferenceRequestBody {
  value?: any;
}

export type SetWorkspacePreferenceInput = SetWorkspacePreferenceRequestBody & SetWorkspacePreferenceRequestHeaders & SetWorkspacePreferenceRequestQuery & SetWorkspacePreferenceRequestParams

export type SetWorkspacePreferenceRequest = {
  headers: SetWorkspacePreferenceRequestHeaders;
  query: SetWorkspacePreferenceRequestQuery;
  params: SetWorkspacePreferenceRequestParams;
  body: SetWorkspacePreferenceRequestBody;
}

export const parseReq = (input: SetWorkspacePreferenceInput): SetWorkspacePreferenceRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/preferences/${encodeURIComponent(input['key'])}`,
    headers: {  },
    query: {  },
    params: { 'key': input['key'] },
    body: { 'value': input['value'] },
  }
}

export interface SetWorkspacePreferenceResponse {}

