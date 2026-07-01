// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteTableRowsRequestHeaders {}

export interface DeleteTableRowsRequestQuery {}

export interface DeleteTableRowsRequestParams {
  table: string;
}

export interface DeleteTableRowsRequestBody {
  /**
   * @maxItems 1000
   */
  ids?: number[];
  /**
   * Filter to apply when deleting rows. Deletion with a filter is performed asynchronously in batches and returns a job object to track progress. Example: \{ "createdAt": \{ "$lt": "2026-01-01" \} \}
   */
  filter?: {
    [k: string]: any;
  };
  /**
   * Flag to delete all rows. Use with caution as this action is irreversible.
   */
  deleteAllRows?: boolean;
}

export type DeleteTableRowsInput = DeleteTableRowsRequestBody & DeleteTableRowsRequestHeaders & DeleteTableRowsRequestQuery & DeleteTableRowsRequestParams

export type DeleteTableRowsRequest = {
  headers: DeleteTableRowsRequestHeaders;
  query: DeleteTableRowsRequestQuery;
  params: DeleteTableRowsRequestParams;
  body: DeleteTableRowsRequestBody;
}

export const parseReq = (input: DeleteTableRowsInput): DeleteTableRowsRequest & { path: string } => {
  return {
    path: `/v1/tables/${encodeURIComponent(input['table'])}/rows/delete`,
    headers: {  },
    query: {  },
    params: { 'table': input['table'] },
    body: { 'ids': input['ids'], 'filter': input['filter'], 'deleteAllRows': input['deleteAllRows'] },
  }
}

export interface DeleteTableRowsResponse {
  deletedRows: number;
  job?: {
    id: string;
    status: string;
  };
}

