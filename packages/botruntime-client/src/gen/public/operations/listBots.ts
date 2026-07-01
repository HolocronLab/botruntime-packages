// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListBotsRequestHeaders {}

export interface ListBotsRequestQuery {
  dev?: boolean;
  tags?: {
    [k: string]: string;
  };
  integrationNames?: string[];
  pluginNames?: string[];
  nextToken?: string;
  pageSize?: number;
  sortField?: "createdAt" | "updatedAt";
  sortDirection?: "asc" | "desc";
}

export interface ListBotsRequestParams {}

export interface ListBotsRequestBody {}

export type ListBotsInput = ListBotsRequestBody & ListBotsRequestHeaders & ListBotsRequestQuery & ListBotsRequestParams

export type ListBotsRequest = {
  headers: ListBotsRequestHeaders;
  query: ListBotsRequestQuery;
  params: ListBotsRequestParams;
  body: ListBotsRequestBody;
}

export const parseReq = (input: ListBotsInput): ListBotsRequest & { path: string } => {
  return {
    path: `/v1/admin/bots`,
    headers: {  },
    query: { 'dev': input['dev'], 'tags': input['tags'], 'integrationNames': input['integrationNames'], 'pluginNames': input['pluginNames'], 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'sortField': input['sortField'], 'sortDirection': input['sortDirection'] },
    params: {  },
    body: {  },
  }
}

export interface ListBotsResponse {
  bots: {
    /**
     * Id of the [Bot](#schema_bot)
     */
    id: string;
    /**
     * Creation date of the [Bot](#schema_bot) in ISO 8601 format
     */
    createdAt: string;
    /**
     * Updating date of the [Bot](#schema_bot) in ISO 8601 format
     */
    updatedAt: string;
    name: string;
    deployedAt?: string;
    /**
     * Tags of [Bot](#schema_bot)
     */
    tags: {
      [k: string]: string;
    };
    /**
     * Type of the [Bot](#schema_bot)
     */
    type: "studio" | "adk" | "desk";
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

