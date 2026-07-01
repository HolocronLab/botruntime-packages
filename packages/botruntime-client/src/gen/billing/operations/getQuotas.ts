// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetQuotasRequestHeaders {}

export interface GetQuotasRequestQuery {}

export interface GetQuotasRequestParams {}

export interface GetQuotasRequestBody {}

export type GetQuotasInput = GetQuotasRequestBody & GetQuotasRequestHeaders & GetQuotasRequestQuery & GetQuotasRequestParams

export type GetQuotasRequest = {
  headers: GetQuotasRequestHeaders;
  query: GetQuotasRequestQuery;
  params: GetQuotasRequestParams;
  body: GetQuotasRequestBody;
}

export const parseReq = (_: GetQuotasInput): GetQuotasRequest & { path: string } => {
  return {
    path: `/v2/billing/quotas`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface GetQuotasResponse {
  [k: string]: number;
}

