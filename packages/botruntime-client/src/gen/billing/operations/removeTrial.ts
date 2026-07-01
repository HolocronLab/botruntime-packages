// this file was automatically generated, do not edit
/* eslint-disable */

export interface RemoveTrialRequestHeaders {}

export interface RemoveTrialRequestQuery {}

export interface RemoveTrialRequestParams {}

export interface RemoveTrialRequestBody {}

export type RemoveTrialInput = RemoveTrialRequestBody & RemoveTrialRequestHeaders & RemoveTrialRequestQuery & RemoveTrialRequestParams

export type RemoveTrialRequest = {
  headers: RemoveTrialRequestHeaders;
  query: RemoveTrialRequestQuery;
  params: RemoveTrialRequestParams;
  body: RemoveTrialRequestBody;
}

export const parseReq = (_: RemoveTrialInput): RemoveTrialRequest & { path: string } => {
  return {
    path: `/v2/billing/trials`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface RemoveTrialResponse {}

