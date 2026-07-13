// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpdateTableRowsRequestHeaders {}

export interface UpdateTableRowsRequestQuery {}

export interface UpdateTableRowsRequestParams {
  table: string;
}

export interface UpdateTableRowsRequestBody {
  /**
   * Rows with updated data, identified by ID.
   *
   * @minItems 1
   * @maxItems 1000
   */
  rows: {
    id: number;
    /**
     * Expected row version for optimistic concurrency control.
     */
    rowVersion?: number;
    [k: string]: any;
  }[];
  /**
   * Ensure computed columns are fully processed before returning the result. This is applicable only when the number of rows involved is fewer than 1.
   */
  waitComputed?: boolean;
}

export type UpdateTableRowsInput = UpdateTableRowsRequestBody & UpdateTableRowsRequestHeaders & UpdateTableRowsRequestQuery & UpdateTableRowsRequestParams

export type UpdateTableRowsRequest = {
  headers: UpdateTableRowsRequestHeaders;
  query: UpdateTableRowsRequestQuery;
  params: UpdateTableRowsRequestParams;
  body: UpdateTableRowsRequestBody;
}

export const parseReq = (input: UpdateTableRowsInput): UpdateTableRowsRequest & { path: string } => {
  return {
    path: `/v1/tables/${encodeURIComponent(input['table'])}/rows`,
    headers: {  },
    query: {  },
    params: { 'table': input['table'] },
    body: { 'rows': input['rows'], 'waitComputed': input['waitComputed'] },
  }
}

export interface UpdateTableRowsResponse {
  rows: {
    /**
     * Unique identifier for the row.
     */
    id: number;
    /**
     * System-managed optimistic concurrency token for the row.
     */
    rowVersion: number;
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
  }[];
  /**
   * Alerts for minor issues that don't block the operation but suggest possible improvements.
   */
  warnings?: string[];
  /**
   * Critical issues in specific elements that prevent their successful processing, allowing partial operation success.
   */
  errors?: string[];
}

