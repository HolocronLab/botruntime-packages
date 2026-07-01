// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListPlansRequestHeaders {}

export interface ListPlansRequestQuery {}

export interface ListPlansRequestParams {}

export interface ListPlansRequestBody {}

export type ListPlansInput = ListPlansRequestBody & ListPlansRequestHeaders & ListPlansRequestQuery & ListPlansRequestParams

export type ListPlansRequest = {
  headers: ListPlansRequestHeaders;
  query: ListPlansRequestQuery;
  params: ListPlansRequestParams;
  body: ListPlansRequestBody;
}

export const parseReq = (_: ListPlansInput): ListPlansRequest & { path: string } => {
  return {
    path: `/v2/billing/plans`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export type ListPlansResponse = GetPlanResponse[];

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

