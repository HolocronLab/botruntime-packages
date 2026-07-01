// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListKnowledgeBasesRequestHeaders {}

export interface ListKnowledgeBasesRequestQuery {
  nextToken?: string;
  pageSize?: number;
  tags?: any;
}

export interface ListKnowledgeBasesRequestParams {}

export interface ListKnowledgeBasesRequestBody {}

export type ListKnowledgeBasesInput = ListKnowledgeBasesRequestBody & ListKnowledgeBasesRequestHeaders & ListKnowledgeBasesRequestQuery & ListKnowledgeBasesRequestParams

export type ListKnowledgeBasesRequest = {
  headers: ListKnowledgeBasesRequestHeaders;
  query: ListKnowledgeBasesRequestQuery;
  params: ListKnowledgeBasesRequestParams;
  body: ListKnowledgeBasesRequestBody;
}

export const parseReq = (input: ListKnowledgeBasesInput): ListKnowledgeBasesRequest & { path: string } => {
  return {
    path: `/v1/files/knowledge-bases`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'tags': input['tags'] },
    params: {  },
    body: {  },
  }
}

export interface ListKnowledgeBasesResponse {
  knowledgeBases: {
    /**
     * Knowledge base ID
     */
    id: string;
    /**
     * Name of the knowledge base.
     */
    name: string;
    /**
     * Knowledge base creation timestamp in ISO 8601 format
     */
    createdAt: string;
    tags: {
      [k: string]: string;
    };
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

