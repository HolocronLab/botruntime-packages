// this file was automatically generated, do not edit
/* eslint-disable */

export interface SetPaymentMethodRequestHeaders {}

export interface SetPaymentMethodRequestQuery {}

export interface SetPaymentMethodRequestParams {}

export interface SetPaymentMethodRequestBody {
  /**
   * Stripe payment method ID
   */
  paymentMethodId: string;
}

export type SetPaymentMethodInput = SetPaymentMethodRequestBody & SetPaymentMethodRequestHeaders & SetPaymentMethodRequestQuery & SetPaymentMethodRequestParams

export type SetPaymentMethodRequest = {
  headers: SetPaymentMethodRequestHeaders;
  query: SetPaymentMethodRequestQuery;
  params: SetPaymentMethodRequestParams;
  body: SetPaymentMethodRequestBody;
}

export const parseReq = (input: SetPaymentMethodInput): SetPaymentMethodRequest & { path: string } => {
  return {
    path: `/v2/billing/payment-methods`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'paymentMethodId': input['paymentMethodId'] },
  }
}

export interface SetPaymentMethodResponse {
  id: string;
  type: string;
  card: {
    brand: string;
    lastFour: string;
    expMonth: number;
    expYear: number;
  } | null;
}

