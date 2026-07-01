// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListFilePassagesRequestHeaders {}

export interface ListFilePassagesRequestQuery {
  nextToken?: string;
  pageSize?: number;
  limit?: number;
}

export interface ListFilePassagesRequestParams {
  id: string;
}

export interface ListFilePassagesRequestBody {}

export type ListFilePassagesInput = ListFilePassagesRequestBody & ListFilePassagesRequestHeaders & ListFilePassagesRequestQuery & ListFilePassagesRequestParams

export type ListFilePassagesRequest = {
  headers: ListFilePassagesRequestHeaders;
  query: ListFilePassagesRequestQuery;
  params: ListFilePassagesRequestParams;
  body: ListFilePassagesRequestBody;
}

export const parseReq = (input: ListFilePassagesInput): ListFilePassagesRequest & { path: string } => {
  return {
    path: `/v1/files/${encodeURIComponent(input['id'])}/passages`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'limit': input['limit'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface ListFilePassagesResponse {
  passages: {
    /**
     * Passage ID
     */
    id: string;
    /**
     * The content of the passage.
     */
    content: string;
    /**
     * The passage metadata.
     */
    meta: {
      /**
       * The type of passage
       */
      type?: "chunk" | "summary" | "consolidated" | "image";
      /**
       * The subtype of passage, if available.
       */
      subtype?: "title" | "subtitle" | "paragraph" | "blockquote" | "list" | "table" | "code" | "image" | "page";
      /**
       * Page number the passage is located on. Only applicable if the passage was extracted from a PDF file.
       */
      pageNumber?: number;
      /**
       * Position number of the passage in the file relative to the other passages, if available. Can be used to know the order of passages within a file.
       */
      position?: number;
      /**
       * The URL of the source file for the vector, if applicable (e.g. for image vectors).
       */
      sourceUrl?: string;
    };
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

