// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetMultipleUsagesRequestHeaders {}

export interface GetMultipleUsagesRequestQuery {
  types: string[];
  ids: string[];
  period?: string;
}

export interface GetMultipleUsagesRequestParams {}

export interface GetMultipleUsagesRequestBody {}

export type GetMultipleUsagesInput = GetMultipleUsagesRequestBody & GetMultipleUsagesRequestHeaders & GetMultipleUsagesRequestQuery & GetMultipleUsagesRequestParams

export type GetMultipleUsagesRequest = {
  headers: GetMultipleUsagesRequestHeaders;
  query: GetMultipleUsagesRequestQuery;
  params: GetMultipleUsagesRequestParams;
  body: GetMultipleUsagesRequestBody;
}

export const parseReq = (input: GetMultipleUsagesInput): GetMultipleUsagesRequest & { path: string } => {
  return {
    path: `/v1/admin/usages/multiple`,
    headers: {  },
    query: { 'types': input['types'], 'ids': input['ids'], 'period': input['period'] },
    params: {  },
    body: {  },
  }
}

export interface GetMultipleUsagesResponse {
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

