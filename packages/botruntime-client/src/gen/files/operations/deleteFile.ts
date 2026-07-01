// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteFileRequestHeaders {}

export interface DeleteFileRequestQuery {}

export interface DeleteFileRequestParams {
  id: string;
}

export interface DeleteFileRequestBody {}

export type DeleteFileInput = DeleteFileRequestBody & DeleteFileRequestHeaders & DeleteFileRequestQuery & DeleteFileRequestParams

export type DeleteFileRequest = {
  headers: DeleteFileRequestHeaders;
  query: DeleteFileRequestQuery;
  params: DeleteFileRequestParams;
  body: DeleteFileRequestBody;
}

export const parseReq = (input: DeleteFileInput): DeleteFileRequest & { path: string } => {
  return {
    path: `/v1/files/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteFileResponse {}

