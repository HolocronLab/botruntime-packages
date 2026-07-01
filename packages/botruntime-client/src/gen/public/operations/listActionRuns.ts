// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListActionRunsRequestHeaders {}

export interface ListActionRunsRequestQuery {
  integrationName: string;
  timestampFrom?: string;
  timestampUntil?: string;
  nextToken?: string;
  pageSize?: number;
}

export interface ListActionRunsRequestParams {
  id: string;
}

export interface ListActionRunsRequestBody {}

export type ListActionRunsInput = ListActionRunsRequestBody & ListActionRunsRequestHeaders & ListActionRunsRequestQuery & ListActionRunsRequestParams

export type ListActionRunsRequest = {
  headers: ListActionRunsRequestHeaders;
  query: ListActionRunsRequestQuery;
  params: ListActionRunsRequestParams;
  body: ListActionRunsRequestBody;
}

export const parseReq = (input: ListActionRunsInput): ListActionRunsRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/action-runs`,
    headers: {  },
    query: { 'integrationName': input['integrationName'], 'timestampFrom': input['timestampFrom'], 'timestampUntil': input['timestampUntil'], 'nextToken': input['nextToken'], 'pageSize': input['pageSize'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface ListActionRunsResponse {
  data: {
    /**
     * ISO 8601 timestamp of the action run
     */
    timestamp: string;
    /**
     * Alias of the integration instance used for this action run
     */
    integrationName?: string;
    actionType: string;
    /**
     * Input of the action
     */
    input: {
      [k: string]: any;
    };
    /**
     * Present if the length of the action's input exceeds 190 KB.
     */
    inputTruncated?: boolean;
    /**
     * Output of the action
     */
    output: {
      [k: string]: any;
    } | null;
    /**
     * Present if the length of the action's output exceeds 190 KB.
     */
    outputTruncated?: boolean;
    status: "SUCCESS" | "FAILURE";
    durationMs: number;
    cached: boolean;
    errorMessage?: string | null;
  }[];
  meta: {
    nextToken?: string;
  };
}

