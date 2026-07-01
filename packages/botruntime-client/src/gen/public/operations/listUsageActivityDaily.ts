// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListUsageActivityDailyRequestHeaders {}

export interface ListUsageActivityDailyRequestQuery {
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
  dateFrom?: string;
  dateUntil?: string;
  nextToken?: string;
  pageSize?: number;
}

export interface ListUsageActivityDailyRequestParams {
  id: string;
}

export interface ListUsageActivityDailyRequestBody {}

export type ListUsageActivityDailyInput = ListUsageActivityDailyRequestBody & ListUsageActivityDailyRequestHeaders & ListUsageActivityDailyRequestQuery & ListUsageActivityDailyRequestParams

export type ListUsageActivityDailyRequest = {
  headers: ListUsageActivityDailyRequestHeaders;
  query: ListUsageActivityDailyRequestQuery;
  params: ListUsageActivityDailyRequestParams;
  body: ListUsageActivityDailyRequestBody;
}

export const parseReq = (input: ListUsageActivityDailyInput): ListUsageActivityDailyRequest & { path: string } => {
  return {
    path: `/v1/admin/usages/${encodeURIComponent(input['id'])}/daily-activity`,
    headers: {  },
    query: { 'type': input['type'], 'dateFrom': input['dateFrom'], 'dateUntil': input['dateUntil'], 'nextToken': input['nextToken'], 'pageSize': input['pageSize'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface ListUsageActivityDailyResponse {
  data: {
    key: string;
    date: string;
    value: number;
    metadata?: {
      botId: string;
      type: "IntegrationAction" | "FileIndexing" | "BingSearch" | "WebSearch";
      subtype?: string;
      source?: string;
    };
  }[];
  meta: {
    nextToken?: string;
  };
}

