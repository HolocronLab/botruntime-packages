// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeletePluginRequestHeaders {}

export interface DeletePluginRequestQuery {}

export interface DeletePluginRequestParams {
  id: string;
}

export interface DeletePluginRequestBody {}

export type DeletePluginInput = DeletePluginRequestBody & DeletePluginRequestHeaders & DeletePluginRequestQuery & DeletePluginRequestParams

export type DeletePluginRequest = {
  headers: DeletePluginRequestHeaders;
  query: DeletePluginRequestQuery;
  params: DeletePluginRequestParams;
  body: DeletePluginRequestBody;
}

export const parseReq = (input: DeletePluginInput): DeletePluginRequest & { path: string } => {
  return {
    path: `/v1/admin/plugins/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeletePluginResponse {}

