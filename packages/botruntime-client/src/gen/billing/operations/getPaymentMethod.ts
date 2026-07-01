// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetPaymentMethodRequestHeaders {}

export interface GetPaymentMethodRequestQuery {}

export interface GetPaymentMethodRequestParams {}

export interface GetPaymentMethodRequestBody {}

export type GetPaymentMethodInput = GetPaymentMethodRequestBody & GetPaymentMethodRequestHeaders & GetPaymentMethodRequestQuery & GetPaymentMethodRequestParams

export type GetPaymentMethodRequest = {
  headers: GetPaymentMethodRequestHeaders;
  query: GetPaymentMethodRequestQuery;
  params: GetPaymentMethodRequestParams;
  body: GetPaymentMethodRequestBody;
}

export const parseReq = (_: GetPaymentMethodInput): GetPaymentMethodRequest & { path: string } => {
  return {
    path: `/v2/billing/payment-methods`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface GetPaymentMethodResponse {
  paymentMethod: {
    id: string;
    type: string;
    card: {
      brand: string;
      lastFour: string;
      expMonth: number;
      expYear: number;
    } | null;
  } | null;
}

