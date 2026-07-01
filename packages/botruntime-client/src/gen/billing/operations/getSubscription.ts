// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetSubscriptionRequestHeaders {}

export interface GetSubscriptionRequestQuery {}

export interface GetSubscriptionRequestParams {}

export interface GetSubscriptionRequestBody {}

export type GetSubscriptionInput = GetSubscriptionRequestBody & GetSubscriptionRequestHeaders & GetSubscriptionRequestQuery & GetSubscriptionRequestParams

export type GetSubscriptionRequest = {
  headers: GetSubscriptionRequestHeaders;
  query: GetSubscriptionRequestQuery;
  params: GetSubscriptionRequestParams;
  body: GetSubscriptionRequestBody;
}

export const parseReq = (_: GetSubscriptionInput): GetSubscriptionRequest & { path: string } => {
  return {
    path: `/v2/billing/subscriptions`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface GetSubscriptionResponse {
  plan: {
    current: {
      status: "active" | "canceled" | "past_due" | "action_required" | "incomplete" | "grace_period";
      planId: string;
      interval: "month" | "year";
      price: number;
      proratedPrice?: number;
      cancelAtPeriodEnd: boolean;
      periodEnd: string;
    };
    next: {
      planId: string;
      interval: "month" | "year";
      price: number | null;
      effectiveDate: string;
    } | null;
  };
  addons: {
    [k: string]: {
      current: {
        quantity: number;
        price: number;
        proratedPrice?: number;
      };
      next: {
        quantity: number;
        price: number;
        effectiveDate: string;
      } | null;
    };
  };
  /**
   * Active discounts applied to the subscription
   */
  discounts: {
    id: string;
    couponId: string;
    promotionCode: string | null;
    name: string | null;
    percentOff: number | null;
    /**
     * Discount amount in dollars, or null if percent-based
     */
    amountOff: number | null;
    currency: string | null;
    duration: "forever" | "once" | "repeating";
    durationInMonths: number | null;
    start: string;
    end: string | null;
  }[];
}

