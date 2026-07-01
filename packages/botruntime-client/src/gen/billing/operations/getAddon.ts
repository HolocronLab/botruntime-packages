// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetAddonRequestHeaders {}

export interface GetAddonRequestQuery {}

export interface GetAddonRequestParams {
  addonId: string;
}

export interface GetAddonRequestBody {}

export type GetAddonInput = GetAddonRequestBody & GetAddonRequestHeaders & GetAddonRequestQuery & GetAddonRequestParams

export type GetAddonRequest = {
  headers: GetAddonRequestHeaders;
  query: GetAddonRequestQuery;
  params: GetAddonRequestParams;
  body: GetAddonRequestBody;
}

export const parseReq = (input: GetAddonInput): GetAddonRequest & { path: string } => {
  return {
    path: `/v2/billing/addons/${encodeURIComponent(input['addonId'])}`,
    headers: {  },
    query: {  },
    params: { 'addonId': input['addonId'] },
    body: {  },
  }
}

export interface GetAddonResponse {
  id: string;
  name: string;
  description: string;
  prices: {
    [k: string]: {
      /**
       * Price in dollars
       */
      amount: number;
      currency: string;
      interval: "month" | "year";
    };
  };
  increments: {
    [k: string]: number;
  };
  metadata?: {
    [k: string]: string;
  };
}

