// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListUsageActivityRequestHeaders {}

export interface ListUsageActivityRequestQuery {
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
  timestampFrom?: string;
  timestampUntil?: string;
  nextToken?: string;
  pageSize?: number;
}

export interface ListUsageActivityRequestParams {
  id: string;
}

export interface ListUsageActivityRequestBody {}

export type ListUsageActivityInput = ListUsageActivityRequestBody & ListUsageActivityRequestHeaders & ListUsageActivityRequestQuery & ListUsageActivityRequestParams

export type ListUsageActivityRequest = {
  headers: ListUsageActivityRequestHeaders;
  query: ListUsageActivityRequestQuery;
  params: ListUsageActivityRequestParams;
  body: ListUsageActivityRequestBody;
}

export const parseReq = (input: ListUsageActivityInput): ListUsageActivityRequest & { path: string } => {
  return {
    path: `/v1/admin/usages/${encodeURIComponent(input['id'])}/activity`,
    headers: {  },
    query: { 'type': input['type'], 'timestampFrom': input['timestampFrom'], 'timestampUntil': input['timestampUntil'], 'nextToken': input['nextToken'], 'pageSize': input['pageSize'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface ListUsageActivityResponse {
  data: {
    timestamp: string;
    value: number;
    period: string;
    metadata: {
      [k: string]: any | null;
    };
  }[];
  meta: {
    nextToken?: string;
  };
}

