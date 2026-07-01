// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetWorkspaceUsageRequestHeaders {}

export interface GetWorkspaceUsageRequestQuery {
  feature:
    | "incoming_messages_events"
    | "integration_spend"
    | "table_rows"
    | "bot_count"
    | "collaborator_count"
    | "file_storage"
    | "vector_db_storage"
    | "saved_versions"
    | "indexed_file_count"
    | "conversation_sessions"
    | "ai_spend";
  /**
   * Any datetime within the desired billing month, ISO 8601. The month is inferred from this value.
   */
  period: string;
}

export interface GetWorkspaceUsageRequestParams {}

export interface GetWorkspaceUsageRequestBody {}

export type GetWorkspaceUsageInput = GetWorkspaceUsageRequestBody & GetWorkspaceUsageRequestHeaders & GetWorkspaceUsageRequestQuery & GetWorkspaceUsageRequestParams

export type GetWorkspaceUsageRequest = {
  headers: GetWorkspaceUsageRequestHeaders;
  query: GetWorkspaceUsageRequestQuery;
  params: GetWorkspaceUsageRequestParams;
  body: GetWorkspaceUsageRequestBody;
}

export const parseReq = (input: GetWorkspaceUsageInput): GetWorkspaceUsageRequest & { path: string } => {
  return {
    path: `/v2/usage/workspace-usage`,
    headers: {  },
    query: { 'feature': input['feature'], 'period': input['period'] },
    params: {  },
    body: {  },
  }
}

export interface GetWorkspaceUsageResponse {
  usage?: number;
  quota: number;
}

