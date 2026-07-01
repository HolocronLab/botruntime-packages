// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteTableRequestHeaders {}

export interface DeleteTableRequestQuery {}

export interface DeleteTableRequestParams {
  table: string;
}

export interface DeleteTableRequestBody {}

export type DeleteTableInput = DeleteTableRequestBody & DeleteTableRequestHeaders & DeleteTableRequestQuery & DeleteTableRequestParams

export type DeleteTableRequest = {
  headers: DeleteTableRequestHeaders;
  query: DeleteTableRequestQuery;
  params: DeleteTableRequestParams;
  body: DeleteTableRequestBody;
}

export const parseReq = (input: DeleteTableInput): DeleteTableRequest & { path: string } => {
  return {
    path: `/v1/tables/${encodeURIComponent(input['table'])}`,
    headers: {  },
    query: {  },
    params: { 'table': input['table'] },
    body: {  },
  }
}

export interface DeleteTableResponse {}

