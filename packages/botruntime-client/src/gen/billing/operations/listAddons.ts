// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListAddonsRequestHeaders {}

export interface ListAddonsRequestQuery {}

export interface ListAddonsRequestParams {}

export interface ListAddonsRequestBody {}

export type ListAddonsInput = ListAddonsRequestBody & ListAddonsRequestHeaders & ListAddonsRequestQuery & ListAddonsRequestParams

export type ListAddonsRequest = {
  headers: ListAddonsRequestHeaders;
  query: ListAddonsRequestQuery;
  params: ListAddonsRequestParams;
  body: ListAddonsRequestBody;
}

export const parseReq = (_: ListAddonsInput): ListAddonsRequest & { path: string } => {
  return {
    path: `/v2/billing/addons`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export type ListAddonsResponse = GetAddonResponse[];

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

