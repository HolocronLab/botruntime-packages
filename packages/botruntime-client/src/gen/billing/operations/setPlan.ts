// this file was automatically generated, do not edit
/* eslint-disable */

export interface SetPlanRequestHeaders {}

export interface SetPlanRequestQuery {}

export interface SetPlanRequestParams {}

/**
 * Plan update parameters
 */
export interface SetPlanRequestBody {
  planId: string;
  interval: "month" | "year";
  testReferenceTime?: number;
  /**
   * Promotion code to apply with this plan change (optional)
   */
  couponCode?: string;
}

export type SetPlanInput = SetPlanRequestBody & SetPlanRequestHeaders & SetPlanRequestQuery & SetPlanRequestParams

export type SetPlanRequest = {
  headers: SetPlanRequestHeaders;
  query: SetPlanRequestQuery;
  params: SetPlanRequestParams;
  body: SetPlanRequestBody;
}

export const parseReq = (input: SetPlanInput): SetPlanRequest & { path: string } => {
  return {
    path: `/v2/billing/plans`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'planId': input['planId'], 'interval': input['interval'], 'testReferenceTime': input['testReferenceTime'], 'couponCode': input['couponCode'] },
  }
}

/**
 * Subscription details including current plan, addons, and costs
 */
export interface SetPlanResponse {
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

