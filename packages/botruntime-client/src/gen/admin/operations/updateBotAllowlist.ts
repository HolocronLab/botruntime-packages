// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpdateBotAllowlistRequestHeaders {}

export interface UpdateBotAllowlistRequestQuery {}

export interface UpdateBotAllowlistRequestParams {
  botId: string;
}

export interface UpdateBotAllowlistRequestBody {
  /**
   * Allowlist setting of the bot
   */
  setting?: "ALL_WORKSPACE_USERS" | "SELECTED_USERS";
  users?: {
    /**
     * If `true`, the user should be added to the allowlist. If `false`, the user should be removed from the allowlist. This performs a partial update, so any existing users not included here will be kept in the allowlist
     */
    [k: string]: boolean;
  };
}

export type UpdateBotAllowlistInput = UpdateBotAllowlistRequestBody & UpdateBotAllowlistRequestHeaders & UpdateBotAllowlistRequestQuery & UpdateBotAllowlistRequestParams

export type UpdateBotAllowlistRequest = {
  headers: UpdateBotAllowlistRequestHeaders;
  query: UpdateBotAllowlistRequestQuery;
  params: UpdateBotAllowlistRequestParams;
  body: UpdateBotAllowlistRequestBody;
}

export const parseReq = (input: UpdateBotAllowlistInput): UpdateBotAllowlistRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['botId'])}/allowlist`,
    headers: {  },
    query: {  },
    params: { 'botId': input['botId'] },
    body: { 'setting': input['setting'], 'users': input['users'] },
  }
}

export interface UpdateBotAllowlistResponse {}

