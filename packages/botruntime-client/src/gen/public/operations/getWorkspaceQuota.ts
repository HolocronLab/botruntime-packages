// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetWorkspaceQuotaRequestHeaders {}

export interface GetWorkspaceQuotaRequestQuery {
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

export interface GetWorkspaceQuotaRequestParams {
  id: string;
}

export interface GetWorkspaceQuotaRequestBody {}

export type GetWorkspaceQuotaInput = GetWorkspaceQuotaRequestBody & GetWorkspaceQuotaRequestHeaders & GetWorkspaceQuotaRequestQuery & GetWorkspaceQuotaRequestParams

export type GetWorkspaceQuotaRequest = {
  headers: GetWorkspaceQuotaRequestHeaders;
  query: GetWorkspaceQuotaRequestQuery;
  params: GetWorkspaceQuotaRequestParams;
  body: GetWorkspaceQuotaRequestBody;
}

export const parseReq = (input: GetWorkspaceQuotaInput): GetWorkspaceQuotaRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/${encodeURIComponent(input['id'])}/quota`,
    headers: {  },
    query: { 'type': input['type'], 'period': input['period'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetWorkspaceQuotaResponse {
  quota: {
    /**
     * Period of the quota that it is applied to
     */
    period: string;
    /**
     * Value of the quota that is used
     */
    value: number;
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

