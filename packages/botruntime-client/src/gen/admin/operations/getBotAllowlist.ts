// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetBotAllowlistRequestHeaders {}

export interface GetBotAllowlistRequestQuery {}

export interface GetBotAllowlistRequestParams {
  botId: string;
}

export interface GetBotAllowlistRequestBody {}

export type GetBotAllowlistInput = GetBotAllowlistRequestBody & GetBotAllowlistRequestHeaders & GetBotAllowlistRequestQuery & GetBotAllowlistRequestParams

export type GetBotAllowlistRequest = {
  headers: GetBotAllowlistRequestHeaders;
  query: GetBotAllowlistRequestQuery;
  params: GetBotAllowlistRequestParams;
  body: GetBotAllowlistRequestBody;
}

export const parseReq = (input: GetBotAllowlistInput): GetBotAllowlistRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['botId'])}/allowlist`,
    headers: {  },
    query: {  },
    params: { 'botId': input['botId'] },
    body: {  },
  }
}

export interface GetBotAllowlistResponse {
  /**
   * Allowlist setting of the bot
   */
  setting: "ALL_WORKSPACE_USERS" | "SELECTED_USERS";
  users: {
    id: string;
  }[];
}

