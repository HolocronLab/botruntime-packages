// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateKnowledgeBaseRequestHeaders {}

export interface CreateKnowledgeBaseRequestQuery {}

export interface CreateKnowledgeBaseRequestParams {}

export interface CreateKnowledgeBaseRequestBody {
  /**
   * Name of the knowledge base.
   */
  name: string;
  tags?: {
    [k: string]: string;
  };
}

export type CreateKnowledgeBaseInput = CreateKnowledgeBaseRequestBody & CreateKnowledgeBaseRequestHeaders & CreateKnowledgeBaseRequestQuery & CreateKnowledgeBaseRequestParams

export type CreateKnowledgeBaseRequest = {
  headers: CreateKnowledgeBaseRequestHeaders;
  query: CreateKnowledgeBaseRequestQuery;
  params: CreateKnowledgeBaseRequestParams;
  body: CreateKnowledgeBaseRequestBody;
}

export const parseReq = (input: CreateKnowledgeBaseInput): CreateKnowledgeBaseRequest & { path: string } => {
  return {
    path: `/v1/files/knowledge-bases`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'name': input['name'], 'tags': input['tags'] },
  }
}

export interface CreateKnowledgeBaseResponse {
  knowledgeBase: {
    /**
     * Knowledge base ID
     */
    id: string;
    /**
     * Name of the knowledge base.
     */
    name: string;
    tags: {
      [k: string]: string;
    };
  };
}

