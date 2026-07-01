// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetTrialsRequestHeaders {}

export interface GetTrialsRequestQuery {}

export interface GetTrialsRequestParams {}

export interface GetTrialsRequestBody {}

export type GetTrialsInput = GetTrialsRequestBody & GetTrialsRequestHeaders & GetTrialsRequestQuery & GetTrialsRequestParams

export type GetTrialsRequest = {
  headers: GetTrialsRequestHeaders;
  query: GetTrialsRequestQuery;
  params: GetTrialsRequestParams;
  body: GetTrialsRequestBody;
}

export const parseReq = (_: GetTrialsInput): GetTrialsRequest & { path: string } => {
  return {
    path: `/v2/billing/trials`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface GetTrialsResponse {
  trials: {
    id: string;
    trialPlan: string;
    fromPlan: string;
    endsAt: string;
    isActive: boolean;
  }[];
}

