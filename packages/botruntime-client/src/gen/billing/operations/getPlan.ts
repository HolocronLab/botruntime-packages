// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetPlanRequestHeaders {}

export interface GetPlanRequestQuery {}

export interface GetPlanRequestParams {
  planId: string;
}

export interface GetPlanRequestBody {}

export type GetPlanInput = GetPlanRequestBody & GetPlanRequestHeaders & GetPlanRequestQuery & GetPlanRequestParams

export type GetPlanRequest = {
  headers: GetPlanRequestHeaders;
  query: GetPlanRequestQuery;
  params: GetPlanRequestParams;
  body: GetPlanRequestBody;
}

export const parseReq = (input: GetPlanInput): GetPlanRequest & { path: string } => {
  return {
    path: `/v2/billing/plans/${encodeURIComponent(input['planId'])}`,
    headers: {  },
    query: {  },
    params: { 'planId': input['planId'] },
    body: {  },
  }
}

export interface GetPlanResponse {
  id: string;
  name: string;
  description: string;
  prices: {
    month?: {
      /**
       * Price in dollars
       */
      amount: number;
      currency: string;
    };
    year?: {
      /**
       * Price in dollars
       */
      amount: number;
      currency: string;
    };
  };
  features: {
    [k: string]: number;
  };
  metadata?: {
    [k: string]: string;
  };
}

