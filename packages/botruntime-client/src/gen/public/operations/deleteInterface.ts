// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteInterfaceRequestHeaders {}

export interface DeleteInterfaceRequestQuery {}

export interface DeleteInterfaceRequestParams {
  id: string;
}

export interface DeleteInterfaceRequestBody {}

export type DeleteInterfaceInput = DeleteInterfaceRequestBody & DeleteInterfaceRequestHeaders & DeleteInterfaceRequestQuery & DeleteInterfaceRequestParams

export type DeleteInterfaceRequest = {
  headers: DeleteInterfaceRequestHeaders;
  query: DeleteInterfaceRequestQuery;
  params: DeleteInterfaceRequestParams;
  body: DeleteInterfaceRequestBody;
}

export const parseReq = (input: DeleteInterfaceInput): DeleteInterfaceRequest & { path: string } => {
  return {
    path: `/v1/admin/interfaces/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteInterfaceResponse {}

