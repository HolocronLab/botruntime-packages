// this file was automatically generated, do not edit
/* eslint-disable */

export interface SetAutoRechargeSettingsRequestHeaders {}

export interface SetAutoRechargeSettingsRequestQuery {}

export interface SetAutoRechargeSettingsRequestParams {}

export interface SetAutoRechargeSettingsRequestBody {
  settings: {
    [k: string]: {
      enabled: boolean;
      threshold?: number;
    };
  };
}

export type SetAutoRechargeSettingsInput = SetAutoRechargeSettingsRequestBody & SetAutoRechargeSettingsRequestHeaders & SetAutoRechargeSettingsRequestQuery & SetAutoRechargeSettingsRequestParams

export type SetAutoRechargeSettingsRequest = {
  headers: SetAutoRechargeSettingsRequestHeaders;
  query: SetAutoRechargeSettingsRequestQuery;
  params: SetAutoRechargeSettingsRequestParams;
  body: SetAutoRechargeSettingsRequestBody;
}

export const parseReq = (input: SetAutoRechargeSettingsInput): SetAutoRechargeSettingsRequest & { path: string } => {
  return {
    path: `/v2/billing/auto-recharge/settings`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'settings': input['settings'] },
  }
}

export interface SetAutoRechargeSettingsResponse {
  settings: {
    [k: string]: {
      enabled: boolean;
      threshold?: number;
      disabledReason?: string;
    };
  };
}

