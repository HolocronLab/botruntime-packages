// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetWorkspaceUsagesRequestHeaders {}

export interface GetWorkspaceUsagesRequestQuery {
  /**
   * Any datetime within the desired billing month, ISO 8601. The month is inferred from this value.
   */
  period: string;
}

export interface GetWorkspaceUsagesRequestParams {}

export interface GetWorkspaceUsagesRequestBody {}

export type GetWorkspaceUsagesInput = GetWorkspaceUsagesRequestBody & GetWorkspaceUsagesRequestHeaders & GetWorkspaceUsagesRequestQuery & GetWorkspaceUsagesRequestParams

export type GetWorkspaceUsagesRequest = {
  headers: GetWorkspaceUsagesRequestHeaders;
  query: GetWorkspaceUsagesRequestQuery;
  params: GetWorkspaceUsagesRequestParams;
  body: GetWorkspaceUsagesRequestBody;
}

export const parseReq = (input: GetWorkspaceUsagesInput): GetWorkspaceUsagesRequest & { path: string } => {
  return {
    path: `/v2/usage/workspace-usages`,
    headers: {  },
    query: { 'period': input['period'] },
    params: {  },
    body: {  },
  }
}

export interface GetWorkspaceUsagesResponse {
  quotas: {
    [k: string]: {
      usage?: number;
      quota: number;
    };
  };
}

