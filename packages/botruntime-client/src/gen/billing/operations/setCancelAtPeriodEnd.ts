// this file was automatically generated, do not edit
/* eslint-disable */

export interface SetCancelAtPeriodEndRequestHeaders {}

export interface SetCancelAtPeriodEndRequestQuery {}

export interface SetCancelAtPeriodEndRequestParams {}

export interface SetCancelAtPeriodEndRequestBody {}

export type SetCancelAtPeriodEndInput = SetCancelAtPeriodEndRequestBody & SetCancelAtPeriodEndRequestHeaders & SetCancelAtPeriodEndRequestQuery & SetCancelAtPeriodEndRequestParams

export type SetCancelAtPeriodEndRequest = {
  headers: SetCancelAtPeriodEndRequestHeaders;
  query: SetCancelAtPeriodEndRequestQuery;
  params: SetCancelAtPeriodEndRequestParams;
  body: SetCancelAtPeriodEndRequestBody;
}

export const parseReq = (_: SetCancelAtPeriodEndInput): SetCancelAtPeriodEndRequest & { path: string } => {
  return {
    path: `/v2/billing/subscriptions/cancel`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

/**
 * Subscription details including current plan, addons, and costs
 */
export interface SetCancelAtPeriodEndResponse {
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

