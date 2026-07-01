// this file was automatically generated, do not edit
/* eslint-disable */

export interface PreviewSubscriptionUpdateRequestHeaders {}

export interface PreviewSubscriptionUpdateRequestQuery {}

export interface PreviewSubscriptionUpdateRequestParams {}

export interface PreviewSubscriptionUpdateRequestBody {
  plan: {
    /**
     * New plan ID (optional)
     */
    planId: string;
    /**
     * New billing interval (optional)
     */
    interval: "month" | "year";
  };
  /**
   * Map of addon IDs to quantities (optional). Set quantity to 0 to remove addon.
   */
  addons?: {
    [k: string]: number;
  };
  /**
   * Promotion code to apply with this subscription change (optional)
   */
  couponCode?: string;
}

export type PreviewSubscriptionUpdateInput = PreviewSubscriptionUpdateRequestBody & PreviewSubscriptionUpdateRequestHeaders & PreviewSubscriptionUpdateRequestQuery & PreviewSubscriptionUpdateRequestParams

export type PreviewSubscriptionUpdateRequest = {
  headers: PreviewSubscriptionUpdateRequestHeaders;
  query: PreviewSubscriptionUpdateRequestQuery;
  params: PreviewSubscriptionUpdateRequestParams;
  body: PreviewSubscriptionUpdateRequestBody;
}

export const parseReq = (input: PreviewSubscriptionUpdateInput): PreviewSubscriptionUpdateRequest & { path: string } => {
  return {
    path: `/v2/billing/subscriptions/preview`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'plan': input['plan'], 'addons': input['addons'], 'couponCode': input['couponCode'] },
  }
}

/**
 * Preview of subscription update costs
 */
export interface PreviewSubscriptionUpdateResponse {
  subscription: {
    plan: {
      planId: string;
      interval: "month" | "year";
      effectiveDate: string | null;
    };
    addons: {
      [k: string]: {
        quantity: number;
        effectiveDate: string | null;
        autoAdjusted?: boolean;
      };
    };
  };
  changeType: "upgrade" | "downgrade" | "same";
  costs: {
    /**
     * Prorated charges due immediately (0 for downgrades)
     */
    immediate: {
      /**
       * Sum of proration line items only (not next-cycle charges)
       */
      total: number;
      /**
       * Customer account balance applied (negative = credit used)
       */
      accountBalance: number;
      /**
       * Actual amount charged after credits applied
       */
      amountDue: number;
      lineItems: {
        type: "plan" | "addon" | "proration_credit" | "proration_charge" | "discount";
        id: string;
        description: string;
        /**
         * Line item amount in dollars
         */
        amount: number;
        quantity?: number;
      }[];
    };
    /**
     * Recurring cost for the next billing cycle (plan + addons combined)
     */
    nextCycle: {
      total: number;
      lineItems: {
        type: "plan" | "addon" | "proration_credit" | "proration_charge" | "discount";
        id: string;
        description: string;
        /**
         * Line item amount in dollars
         */
        amount: number;
        quantity?: number;
      }[];
    };
  };
  /**
   * Active discounts applied to the subscription
   */
  discounts?: {
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
  /**
   * Date of the next billing cycle (1st of next month for new subscriptions)
   */
  nextBillingDate: string;
}

