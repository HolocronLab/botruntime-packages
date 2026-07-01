// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteKnowledgeBaseRequestHeaders {}

export interface DeleteKnowledgeBaseRequestQuery {}

export interface DeleteKnowledgeBaseRequestParams {
  id: string;
}

export interface DeleteKnowledgeBaseRequestBody {}

export type DeleteKnowledgeBaseInput = DeleteKnowledgeBaseRequestBody & DeleteKnowledgeBaseRequestHeaders & DeleteKnowledgeBaseRequestQuery & DeleteKnowledgeBaseRequestParams

export type DeleteKnowledgeBaseRequest = {
  headers: DeleteKnowledgeBaseRequestHeaders;
  query: DeleteKnowledgeBaseRequestQuery;
  params: DeleteKnowledgeBaseRequestParams;
  body: DeleteKnowledgeBaseRequestBody;
}

export const parseReq = (input: DeleteKnowledgeBaseInput): DeleteKnowledgeBaseRequest & { path: string } => {
  return {
    path: `/v1/files/knowledge-bases/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteKnowledgeBaseResponse {}

