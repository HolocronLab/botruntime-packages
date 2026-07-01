// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetAllWorkspaceQuotaCompletionRequestHeaders {}

export interface GetAllWorkspaceQuotaCompletionRequestQuery {}

export interface GetAllWorkspaceQuotaCompletionRequestParams {}

export interface GetAllWorkspaceQuotaCompletionRequestBody {}

export type GetAllWorkspaceQuotaCompletionInput = GetAllWorkspaceQuotaCompletionRequestBody & GetAllWorkspaceQuotaCompletionRequestHeaders & GetAllWorkspaceQuotaCompletionRequestQuery & GetAllWorkspaceQuotaCompletionRequestParams

export type GetAllWorkspaceQuotaCompletionRequest = {
  headers: GetAllWorkspaceQuotaCompletionRequestHeaders;
  query: GetAllWorkspaceQuotaCompletionRequestQuery;
  params: GetAllWorkspaceQuotaCompletionRequestParams;
  body: GetAllWorkspaceQuotaCompletionRequestBody;
}

export const parseReq = (_: GetAllWorkspaceQuotaCompletionInput): GetAllWorkspaceQuotaCompletionRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/usages/quota-completion`,
    headers: {  },
    query: {  },
    params: {  },
    body: {  },
  }
}

export interface GetAllWorkspaceQuotaCompletionResponse {
  [k: string]: {
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
    completion: number;
  };
}

