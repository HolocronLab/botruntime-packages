// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListUsageHistoryRequestHeaders {}

export interface ListUsageHistoryRequestQuery {
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
}

export interface ListUsageHistoryRequestParams {
  id: string;
}

export interface ListUsageHistoryRequestBody {}

export type ListUsageHistoryInput = ListUsageHistoryRequestBody & ListUsageHistoryRequestHeaders & ListUsageHistoryRequestQuery & ListUsageHistoryRequestParams

export type ListUsageHistoryRequest = {
  headers: ListUsageHistoryRequestHeaders;
  query: ListUsageHistoryRequestQuery;
  params: ListUsageHistoryRequestParams;
  body: ListUsageHistoryRequestBody;
}

export const parseReq = (input: ListUsageHistoryInput): ListUsageHistoryRequest & { path: string } => {
  return {
    path: `/v1/admin/usages/${encodeURIComponent(input['id'])}/history`,
    headers: {  },
    query: { 'type': input['type'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface ListUsageHistoryResponse {
  usages: {
    /**
     * Id of the usage that it is linked to. It can either be a workspace id or a bot id
     */
    id: string;
    /**
     * Period of the quota that it is applied to
     */
    period: string;
    /**
     * Value of the current usage
     */
    value: number;
    /**
     * Quota of the current usage
     */
    quota: number;
    /**
     * Usage type that can be used
     */
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
  }[];
}

