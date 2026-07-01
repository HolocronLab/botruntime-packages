// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListBotIssuesRequestHeaders {}

export interface ListBotIssuesRequestQuery {
  nextToken?: string;
  pageSize?: number;
}

export interface ListBotIssuesRequestParams {
  id: string;
}

export interface ListBotIssuesRequestBody {}

export type ListBotIssuesInput = ListBotIssuesRequestBody & ListBotIssuesRequestHeaders & ListBotIssuesRequestQuery & ListBotIssuesRequestParams

export type ListBotIssuesRequest = {
  headers: ListBotIssuesRequestHeaders;
  query: ListBotIssuesRequestQuery;
  params: ListBotIssuesRequestParams;
  body: ListBotIssuesRequestBody;
}

export const parseReq = (input: ListBotIssuesInput): ListBotIssuesRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/issues`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface ListBotIssuesResponse {
  issues: {
    id: string;
    code: string;
    createdAt: string;
    lastSeenAt: string;
    title: string;
    description: string;
    groupedData: {
      [k: string]: {
        raw: string;
        pretty?: string;
      };
    };
    eventsCount: number;
    category: "user_code" | "limits" | "configuration" | "other";
    resolutionLink: string | null;
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

