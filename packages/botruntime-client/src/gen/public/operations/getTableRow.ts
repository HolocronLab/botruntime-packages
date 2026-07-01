// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetTableRowRequestHeaders {}

export interface GetTableRowRequestQuery {
  id: number;
}

export interface GetTableRowRequestParams {
  table: string;
}

export interface GetTableRowRequestBody {}

export type GetTableRowInput = GetTableRowRequestBody & GetTableRowRequestHeaders & GetTableRowRequestQuery & GetTableRowRequestParams

export type GetTableRowRequest = {
  headers: GetTableRowRequestHeaders;
  query: GetTableRowRequestQuery;
  params: GetTableRowRequestParams;
  body: GetTableRowRequestBody;
}

export const parseReq = (input: GetTableRowInput): GetTableRowRequest & { path: string } => {
  return {
    path: `/v1/tables/${encodeURIComponent(input['table'])}/row`,
    headers: {  },
    query: { 'id': input['id'] },
    params: { 'table': input['table'] },
    body: {  },
  }
}

export interface GetTableRowResponse {
  row: {
    /**
     * Unique identifier for the row.
     */
    id: number;
    /**
     * Timestamp of row creation.
     */
    createdAt?: string;
    /**
     * Timestamp of the last row update.
     */
    updatedAt?: string;
    computed: {
      [k: string]: {
        status: string;
        error?: string;
        updatedBy?: string;
        updatedAt?: string;
      };
    };
    /**
     * [Read-only] List of stale values that are waiting to be recomputed.
     */
    stale?: string[];
    /**
     * Optional numeric value indicating similarity, when using findTableRows.
     */
    similarity?: number;
    [k: string]: any;
  };
}

