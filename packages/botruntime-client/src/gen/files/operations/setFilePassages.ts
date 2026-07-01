// this file was automatically generated, do not edit
/* eslint-disable */

export interface SetFilePassagesRequestHeaders {}

export interface SetFilePassagesRequestQuery {}

export interface SetFilePassagesRequestParams {
  id: string;
}

export interface SetFilePassagesRequestBody {
  /**
   * Note: The passages should appear in the array in the same order as they appear in the original document.
   */
  passages: {
    /**
     * The content of the passage, supports Markdown formatting.
     */
    content: string;
    /**
     * The type should match the Markdown format used for the passage content.
     */
    type?: "title" | "subtitle" | "paragraph" | "blockquote" | "list" | "table" | "code" | "image";
    pageNumber?: number;
  }[];
}

export type SetFilePassagesInput = SetFilePassagesRequestBody & SetFilePassagesRequestHeaders & SetFilePassagesRequestQuery & SetFilePassagesRequestParams

export type SetFilePassagesRequest = {
  headers: SetFilePassagesRequestHeaders;
  query: SetFilePassagesRequestQuery;
  params: SetFilePassagesRequestParams;
  body: SetFilePassagesRequestBody;
}

export const parseReq = (input: SetFilePassagesInput): SetFilePassagesRequest & { path: string } => {
  return {
    path: `/v1/files/${encodeURIComponent(input['id'])}/passages`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'passages': input['passages'] },
  }
}

export interface SetFilePassagesResponse {}

