// this file was automatically generated, do not edit
/* eslint-disable */

export interface SetBillingAddressRequestHeaders {}

export interface SetBillingAddressRequestQuery {}

export interface SetBillingAddressRequestParams {}

export interface SetBillingAddressRequestBody {
  lineOne: string;
  lineTwo?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export type SetBillingAddressInput = SetBillingAddressRequestBody & SetBillingAddressRequestHeaders & SetBillingAddressRequestQuery & SetBillingAddressRequestParams

export type SetBillingAddressRequest = {
  headers: SetBillingAddressRequestHeaders;
  query: SetBillingAddressRequestQuery;
  params: SetBillingAddressRequestParams;
  body: SetBillingAddressRequestBody;
}

export const parseReq = (input: SetBillingAddressInput): SetBillingAddressRequest & { path: string } => {
  return {
    path: `/v2/billing/address`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'lineOne': input['lineOne'], 'lineTwo': input['lineTwo'], 'city': input['city'], 'state': input['state'], 'postalCode': input['postalCode'], 'country': input['country'] },
  }
}

export interface SetBillingAddressResponse {}

