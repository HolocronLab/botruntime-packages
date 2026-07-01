// this file was automatically generated, do not edit
/* eslint-disable */

export interface ImportTableRequestHeaders {}

export interface ImportTableRequestQuery {}

export interface ImportTableRequestParams {
  table: string;
}

export interface ImportTableRequestBody {
  /**
   * The file ID to import. It must have been uploaded to the Files API before. Supported formats: CSV, JSON (gzipped or not)
   */
  fileId: string;
}

export type ImportTableInput = ImportTableRequestBody & ImportTableRequestHeaders & ImportTableRequestQuery & ImportTableRequestParams

export type ImportTableRequest = {
  headers: ImportTableRequestHeaders;
  query: ImportTableRequestQuery;
  params: ImportTableRequestParams;
  body: ImportTableRequestBody;
}

export const parseReq = (input: ImportTableInput): ImportTableRequest & { path: string } => {
  return {
    path: `/v1/tables/${encodeURIComponent(input['table'])}/import`,
    headers: {  },
    query: {  },
    params: { 'table': input['table'] },
    body: { 'fileId': input['fileId'] },
  }
}

export interface ImportTableResponse {
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

