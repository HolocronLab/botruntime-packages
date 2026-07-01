// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetAutoRechargeSettingsRequestHeaders {}

export interface GetAutoRechargeSettingsRequestQuery {}

export interface GetAutoRechargeSettingsRequestParams {}

export interface GetAutoRechargeSettingsRequestBody {}

export type GetAutoRechargeSettingsInput = GetAutoRechargeSettingsRequestBody & GetAutoRechargeSettingsRequestHeaders & GetAutoRechargeSettingsRequestQuery & GetAutoRechargeSettingsRequestParams

export type GetAutoRechargeSettingsRequest = {
  headers: GetAutoRechargeSettingsRequestHeaders;
  query: GetAutoRechargeSettingsRequestQuery;
  params: GetAutoRechargeSettingsRequestParams;
  body: GetAutoRechargeSettingsRequestBody;
}

export const parseReq = (_: GetAutoRechargeSettingsInput): GetAutoRechargeSettingsRequest & { path: string } => {
  return {
    path: `/v2/billing/auto-recharge/settings`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
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

