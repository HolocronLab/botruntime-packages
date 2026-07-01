// this file was automatically generated, do not edit
/* eslint-disable */

export interface RunVrlRequestHeaders {}

export interface RunVrlRequestQuery {}

export interface RunVrlRequestParams {}

export interface RunVrlRequestBody {
  data: {
    [k: string]: any;
  };
  script: string;
}

export type RunVrlInput = RunVrlRequestBody & RunVrlRequestHeaders & RunVrlRequestQuery & RunVrlRequestParams

export type RunVrlRequest = {
  headers: RunVrlRequestHeaders;
  query: RunVrlRequestQuery;
  params: RunVrlRequestParams;
  body: RunVrlRequestBody;
}

export const parseReq = (input: RunVrlInput): RunVrlRequest & { path: string } => {
  return {
    path: `/v1/admin/helper/vrl`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'data': input['data'], 'script': input['script'] },
  }
}

export interface RunVrlResponse {
  data: {
    [k: string]: any;
  };
  result?: any;
}

