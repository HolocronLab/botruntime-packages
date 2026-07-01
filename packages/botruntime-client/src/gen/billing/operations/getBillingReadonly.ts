// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetBillingReadonlyRequestHeaders {}

export interface GetBillingReadonlyRequestQuery {}

export interface GetBillingReadonlyRequestParams {}

export interface GetBillingReadonlyRequestBody {}

export type GetBillingReadonlyInput = GetBillingReadonlyRequestBody & GetBillingReadonlyRequestHeaders & GetBillingReadonlyRequestQuery & GetBillingReadonlyRequestParams

export type GetBillingReadonlyRequest = {
  headers: GetBillingReadonlyRequestHeaders;
  query: GetBillingReadonlyRequestQuery;
  params: GetBillingReadonlyRequestParams;
  body: GetBillingReadonlyRequestBody;
}

export const parseReq = (_: GetBillingReadonlyInput): GetBillingReadonlyRequest & { path: string } => {
  return {
    path: `/v2/billing/readonly`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface GetBillingReadonlyResponse {
  planReadonly: boolean;
  addonsReadonly: boolean;
}

