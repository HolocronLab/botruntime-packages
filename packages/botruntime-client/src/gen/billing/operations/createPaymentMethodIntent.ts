// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreatePaymentMethodIntentRequestHeaders {}

export interface CreatePaymentMethodIntentRequestQuery {}

export interface CreatePaymentMethodIntentRequestParams {}

export interface CreatePaymentMethodIntentRequestBody {}

export type CreatePaymentMethodIntentInput = CreatePaymentMethodIntentRequestBody & CreatePaymentMethodIntentRequestHeaders & CreatePaymentMethodIntentRequestQuery & CreatePaymentMethodIntentRequestParams

export type CreatePaymentMethodIntentRequest = {
  headers: CreatePaymentMethodIntentRequestHeaders;
  query: CreatePaymentMethodIntentRequestQuery;
  params: CreatePaymentMethodIntentRequestParams;
  body: CreatePaymentMethodIntentRequestBody;
}

export const parseReq = (_: CreatePaymentMethodIntentInput): CreatePaymentMethodIntentRequest & { path: string } => {
  return {
    path: `/v2/billing/payment-methods/intent`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface CreatePaymentMethodIntentResponse {
  clientSecret: string;
}

