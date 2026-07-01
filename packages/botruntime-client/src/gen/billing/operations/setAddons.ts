// this file was automatically generated, do not edit
/* eslint-disable */

export interface SetAddonsRequestHeaders {}

export interface SetAddonsRequestQuery {}

export interface SetAddonsRequestParams {}

/**
 * Addons update parameters. Set quantity to 0 to remove an addon.
 */
export interface SetAddonsRequestBody {
  addons: {
    [k: string]: number;
  };
  /**
   * Promotion code to apply with this addon change (optional)
   */
  couponCode?: string;
}

export type SetAddonsInput = SetAddonsRequestBody & SetAddonsRequestHeaders & SetAddonsRequestQuery & SetAddonsRequestParams

export type SetAddonsRequest = {
  headers: SetAddonsRequestHeaders;
  query: SetAddonsRequestQuery;
  params: SetAddonsRequestParams;
  body: SetAddonsRequestBody;
}

export const parseReq = (input: SetAddonsInput): SetAddonsRequest & { path: string } => {
  return {
    path: `/v2/billing/addons`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'addons': input['addons'], 'couponCode': input['couponCode'] },
  }
}

/**
 * Subscription details including current plan, addons, and costs
 */
export interface SetAddonsResponse {
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

