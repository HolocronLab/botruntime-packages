// this file was automatically generated, do not edit
/* eslint-disable */

export interface ExportTableRequestHeaders {}

export interface ExportTableRequestQuery {
  format?: "csv" | "json";
  compress?: boolean;
}

export interface ExportTableRequestParams {
  table: string;
}

export interface ExportTableRequestBody {}

export type ExportTableInput = ExportTableRequestBody & ExportTableRequestHeaders & ExportTableRequestQuery & ExportTableRequestParams

export type ExportTableRequest = {
  headers: ExportTableRequestHeaders;
  query: ExportTableRequestQuery;
  params: ExportTableRequestParams;
  body: ExportTableRequestBody;
}

export const parseReq = (input: ExportTableInput): ExportTableRequest & { path: string } => {
  return {
    path: `/v1/tables/${encodeURIComponent(input['table'])}/export`,
    headers: {  },
    query: { 'format': input['format'], 'compress': input['compress'] },
    params: { 'table': input['table'] },
    body: {  },
  }
}

export interface ExportTableResponse {
  job: {
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
  };
}

