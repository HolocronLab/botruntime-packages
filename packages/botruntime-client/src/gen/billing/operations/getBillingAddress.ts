// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetBillingAddressRequestHeaders {}

export interface GetBillingAddressRequestQuery {}

export interface GetBillingAddressRequestParams {}

export interface GetBillingAddressRequestBody {}

export type GetBillingAddressInput = GetBillingAddressRequestBody & GetBillingAddressRequestHeaders & GetBillingAddressRequestQuery & GetBillingAddressRequestParams

export type GetBillingAddressRequest = {
  headers: GetBillingAddressRequestHeaders;
  query: GetBillingAddressRequestQuery;
  params: GetBillingAddressRequestParams;
  body: GetBillingAddressRequestBody;
}

export const parseReq = (_: GetBillingAddressInput): GetBillingAddressRequest & { path: string } => {
  return {
    path: `/v2/billing/address`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface GetBillingAddressResponse {
  address: {
    lineOne: string;
    lineTwo?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  } | null;
}

