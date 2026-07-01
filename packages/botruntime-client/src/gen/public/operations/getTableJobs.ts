// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetTableJobsRequestHeaders {}

export interface GetTableJobsRequestQuery {}

export interface GetTableJobsRequestParams {
  table: string;
}

export interface GetTableJobsRequestBody {}

export type GetTableJobsInput = GetTableJobsRequestBody & GetTableJobsRequestHeaders & GetTableJobsRequestQuery & GetTableJobsRequestParams

export type GetTableJobsRequest = {
  headers: GetTableJobsRequestHeaders;
  query: GetTableJobsRequestQuery;
  params: GetTableJobsRequestParams;
  body: GetTableJobsRequestBody;
}

export const parseReq = (input: GetTableJobsInput): GetTableJobsRequest & { path: string } => {
  return {
    path: `/v1/tables/${encodeURIComponent(input['table'])}/jobs`,
    headers: {  },
    query: {  },
    params: { 'table': input['table'] },
    body: {  },
  }
}

export interface GetTableJobsResponse {
  jobs: {
    id: string;
    botId: string;
    tableId: string;
    type: "export" | "import" | "clear_column" | "clear_vectors" | "delete_rows" | "duplicate_table";
    status: "pending" | "in_progress" | "finalizing" | "completed" | "failed";
    progress?: number;
    inputFileId: string | null;
    outputFileId: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
}

