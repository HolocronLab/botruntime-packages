// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetUsageRequestHeaders {}

export interface GetUsageRequestQuery {
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

export interface GetUsageRequestParams {
  id: string;
}

export interface GetUsageRequestBody {}

export type GetUsageInput = GetUsageRequestBody & GetUsageRequestHeaders & GetUsageRequestQuery & GetUsageRequestParams

export type GetUsageRequest = {
  headers: GetUsageRequestHeaders;
  query: GetUsageRequestQuery;
  params: GetUsageRequestParams;
  body: GetUsageRequestBody;
}

export const parseReq = (input: GetUsageInput): GetUsageRequest & { path: string } => {
  return {
    path: `/v1/admin/usages/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: { 'type': input['type'], 'period': input['period'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetUsageResponse {
  usage: {
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
  };
}

