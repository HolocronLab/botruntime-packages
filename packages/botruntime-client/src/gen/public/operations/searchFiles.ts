// this file was automatically generated, do not edit
/* eslint-disable */

export interface SearchFilesRequestHeaders {}

export interface SearchFilesRequestQuery {
  tags?: any;
  query: string;
  contextDepth?: number;
  limit?: number;
  consolidate?: boolean;
  includeBreadcrumb?: boolean;
  withContext?: boolean;
}

export interface SearchFilesRequestParams {}

export interface SearchFilesRequestBody {}

export type SearchFilesInput = SearchFilesRequestBody & SearchFilesRequestHeaders & SearchFilesRequestQuery & SearchFilesRequestParams

export type SearchFilesRequest = {
  headers: SearchFilesRequestHeaders;
  query: SearchFilesRequestQuery;
  params: SearchFilesRequestParams;
  body: SearchFilesRequestBody;
}

export const parseReq = (input: SearchFilesInput): SearchFilesRequest & { path: string } => {
  return {
    path: `/v1/files/search`,
    headers: {  },
    query: { 'tags': input['tags'], 'query': input['query'], 'contextDepth': input['contextDepth'], 'limit': input['limit'], 'consolidate': input['consolidate'], 'includeBreadcrumb': input['includeBreadcrumb'], 'withContext': input['withContext'] },
    params: {  },
    body: {  },
  }
}

export interface SearchFilesResponse {
  passages: {
    /**
     * The content of the matching passage in the file including surrounding context, if any.
     */
    content: string;
    /**
     * The score indicating the similarity of the passage to the query. A higher score indicates higher similarity.
     */
    score: number;
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
    file: {
      /**
       * File ID
       */
      id: string;
      /**
       * Unique key for the file. Must be unique across the bot (and the integration, when applicable).
       */
      key: string;
      /**
       * MIME type of the file's content
       */
      contentType: string;
      /**
       * Metadata of the file as an object of key-value pairs.
       */
      metadata: {
        [k: string]: any | null;
      };
      /**
       * The tags of the file as an object of key-value pairs.
       */
      tags: {
        [k: string]: string;
      };
      /**
       * File creation timestamp in ISO 8601 format
       */
      createdAt: string;
      /**
       * File last update timestamp in ISO 8601 format
       */
      updatedAt: string;
    };
    /**
     * Surrounding passages including the current passage, based on the requested `contextDepth`. Only returned if the `withContext` parameter is set to `true`. Not supported when using the `consolidate` option.
     */
    context?: {
      /**
       * The ID of the vector that the context passage belongs to. Omitted for breadcrumbs.
       */
      id?: string;
      text: string;
      /**
       * Position of the context passage relative to the current passage. Negative for preceding passages, positive for subsequent, ommited for breadcrumbs.
       */
      offset?: number;
      /**
       * The type of context passage
       */
      type: "preceding" | "subsequent" | "current" | "breadcrumb";
    }[];
  }[];
}

