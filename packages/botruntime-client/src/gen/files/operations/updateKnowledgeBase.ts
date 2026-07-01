// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpdateKnowledgeBaseRequestHeaders {}

export interface UpdateKnowledgeBaseRequestQuery {}

export interface UpdateKnowledgeBaseRequestParams {
  id: string;
}

export interface UpdateKnowledgeBaseRequestBody {
  /**
   * New name of the knowledge base.
   */
  name: string;
  /**
   * The knowledge base tags to update as an object of key-value pairs with `string` (text) values. Omit to keep existing tags intact. Any existing tags not included will be preserved. New tags will be added. To delete a tag, set its value to `null`.
   */
  tags?: {
    [k: string]: string | null;
  };
}

export type UpdateKnowledgeBaseInput = UpdateKnowledgeBaseRequestBody & UpdateKnowledgeBaseRequestHeaders & UpdateKnowledgeBaseRequestQuery & UpdateKnowledgeBaseRequestParams

export type UpdateKnowledgeBaseRequest = {
  headers: UpdateKnowledgeBaseRequestHeaders;
  query: UpdateKnowledgeBaseRequestQuery;
  params: UpdateKnowledgeBaseRequestParams;
  body: UpdateKnowledgeBaseRequestBody;
}

export const parseReq = (input: UpdateKnowledgeBaseInput): UpdateKnowledgeBaseRequest & { path: string } => {
  return {
    path: `/v1/files/knowledge-bases/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'name': input['name'], 'tags': input['tags'] },
  }
}

export interface UpdateKnowledgeBaseResponse {
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

