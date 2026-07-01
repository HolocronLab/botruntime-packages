// this file was automatically generated, do not edit
/* eslint-disable */

export interface BreakDownWorkspaceUsageByBotRequestHeaders {}

export interface BreakDownWorkspaceUsageByBotRequestQuery {
  type:
    | "invocation_timeout"
    | "invocation_calls"
    | "storage_count"
    | "bot_count"
    | "knowledgebase_vector_storage"
    | "workspace_ratelimit"
    | "table_row_count"
    | "workspace_member_count"
    | "integrations_owned_count"
    | "ai_spend"
    | "openai_spend"
    | "bing_search_spend"
    | "always_alive"
    | "indexed_file_count"
    | "file_max_size_bytes";
  period?: string;
}

export interface BreakDownWorkspaceUsageByBotRequestParams {
  id: string;
}

export interface BreakDownWorkspaceUsageByBotRequestBody {}

export type BreakDownWorkspaceUsageByBotInput = BreakDownWorkspaceUsageByBotRequestBody & BreakDownWorkspaceUsageByBotRequestHeaders & BreakDownWorkspaceUsageByBotRequestQuery & BreakDownWorkspaceUsageByBotRequestParams

export type BreakDownWorkspaceUsageByBotRequest = {
  headers: BreakDownWorkspaceUsageByBotRequestHeaders;
  query: BreakDownWorkspaceUsageByBotRequestQuery;
  params: BreakDownWorkspaceUsageByBotRequestParams;
  body: BreakDownWorkspaceUsageByBotRequestBody;
}

export const parseReq = (input: BreakDownWorkspaceUsageByBotInput): BreakDownWorkspaceUsageByBotRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/${encodeURIComponent(input['id'])}/usages/by-bot`,
    headers: {  },
    query: { 'type': input['type'], 'period': input['period'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface BreakDownWorkspaceUsageByBotResponse {
  data: {
    botId: string;
    value: number;
  }[];
}

