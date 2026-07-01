// this file was automatically generated, do not edit
/* eslint-disable */

export interface Invoice {
  id: string;
  /**
   * Invoice amount in dollars
   */
  amount: number;
  currency: string;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  createdAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  pdfUrl: string | null;
}

export interface Subscription {
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

export interface SubscriptionPreview {
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

export interface SubscriptionUpdateParams {
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

/**
 * Subscription details including current plan, addons, and costs
 */
export interface SubscriptionDetails {
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

/**
 * Plan update parameters
 */
export interface SetPlanParams {
  planId: string;
  interval: "month" | "year";
  testReferenceTime?: number;
  /**
   * Promotion code to apply with this plan change (optional)
   */
  couponCode?: string;
}

/**
 * Addons update parameters. Set quantity to 0 to remove an addon.
 */
export interface SetAddonsParams {
  addons: {
    [k: string]: number;
  };
  /**
   * Promotion code to apply with this addon change (optional)
   */
  couponCode?: string;
}

export interface BillingAddress {
  lineOne: string;
  lineTwo?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface Customer {
  address: {
    lineOne: string;
    lineTwo?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  } | null;
  name: string | null;
  taxIds: {
    type:
      | "ad_nrt"
      | "ae_trn"
      | "al_tin"
      | "am_tin"
      | "ao_tin"
      | "ar_cuit"
      | "au_abn"
      | "au_arn"
      | "aw_tin"
      | "az_tin"
      | "ba_tin"
      | "bb_tin"
      | "bd_bin"
      | "bf_ifu"
      | "bg_uic"
      | "bh_vat"
      | "bj_ifu"
      | "bo_tin"
      | "br_cnpj"
      | "br_cpf"
      | "bs_tin"
      | "by_tin"
      | "ca_bn"
      | "ca_gst_hst"
      | "ca_pst_bc"
      | "ca_pst_mb"
      | "ca_pst_sk"
      | "ca_qst"
      | "cd_nif"
      | "ch_uid"
      | "ch_vat"
      | "cl_tin"
      | "cm_niu"
      | "cn_tin"
      | "co_nit"
      | "cr_tin"
      | "cv_nif"
      | "de_stn"
      | "do_rcn"
      | "ec_ruc"
      | "eg_tin"
      | "es_cif"
      | "et_tin"
      | "eu_oss_vat"
      | "eu_vat"
      | "gb_vat"
      | "ge_vat"
      | "gn_nif"
      | "hk_br"
      | "hr_oib"
      | "hu_tin"
      | "id_npwp"
      | "il_vat"
      | "in_gst"
      | "is_vat"
      | "jp_cn"
      | "jp_rn"
      | "jp_trn"
      | "ke_pin"
      | "kg_tin"
      | "kh_tin"
      | "kr_brn"
      | "kz_bin"
      | "la_tin"
      | "li_uid"
      | "li_vat"
      | "ma_vat"
      | "md_vat"
      | "me_pib"
      | "mk_vat"
      | "mr_nif"
      | "mx_rfc"
      | "my_frp"
      | "my_itn"
      | "my_sst"
      | "ng_tin"
      | "no_vat"
      | "no_voec"
      | "np_pan"
      | "nz_gst"
      | "om_vat"
      | "pe_ruc"
      | "ph_tin"
      | "ro_tin"
      | "rs_pib"
      | "ru_inn"
      | "ru_kpp"
      | "sa_vat"
      | "sg_gst"
      | "sg_uen"
      | "si_tin"
      | "sn_ninea"
      | "sr_fin"
      | "sv_nit"
      | "th_vat"
      | "tj_tin"
      | "tr_tin"
      | "tw_vat"
      | "tz_vat"
      | "ua_vat"
      | "ug_tin"
      | "us_ein"
      | "uy_ruc"
      | "uz_tin"
      | "uz_vat"
      | "ve_rif"
      | "vn_tin"
      | "za_vat"
      | "zm_tin"
      | "zw_tin";
    value: string;
  }[];
}

export interface Trial {
  id: string;
  trialPlan: string;
  fromPlan: string;
  endsAt: string;
  isActive: boolean;
}

export interface GetTrialsResponse {
  trials: {
    id: string;
    trialPlan: string;
    fromPlan: string;
    endsAt: string;
    isActive: boolean;
  }[];
}

export interface CreateTrialParams {
  lengthInDays: number;
  plan: string;
}

export interface GetAutoRechargeSettingsResponse {
  settings: {
    [k: string]: {
      enabled: boolean;
      threshold?: number;
      disabledReason?: string;
    };
  };
}

export interface SetAutoRechargeSettingsParams {
  settings: {
    [k: string]: {
      enabled: boolean;
      threshold?: number;
    };
  };
}

export interface CreditGrant {
  id: string;
  workspace_id: string;
  invoice_id: string;
  /**
   * Dollar value of the credit grant (e.g. 10 = $10.00 USD)
   */
  amount: number;
  feature:
    | "incoming_messages_events"
    | "integration_spend"
    | "table_rows"
    | "bot_count"
    | "collaborator_count"
    | "file_storage"
    | "vector_db_storage"
    | "saved_versions"
    | "indexed_file_count"
    | "conversation_sessions"
    | "ai_spend";
  /**
   * Start of the period (inclusive)
   */
  period_start: string;
  /**
   * End of the period (exclusive)
   */
  period_end: string;
  updatedAt: string;
  createdAt: string;
}

export interface CreateCreditGrantParams {
  /**
   * Nanodollar value of the credit grant (e.g. 10_000_000_000 = $10.00 USD)
   */
  amount: number;
  feature: "ai_spend";
}

