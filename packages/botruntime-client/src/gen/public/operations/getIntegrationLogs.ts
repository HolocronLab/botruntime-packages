// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetIntegrationLogsRequestHeaders {}

export interface GetIntegrationLogsRequestQuery {
  timeStart: string;
  timeEnd?: string;
  level?: string;
  userId?: string;
  conversationId?: string;
  messageContains?: string;
  nextToken?: string;
}

export interface GetIntegrationLogsRequestParams {
  id: string;
}

export interface GetIntegrationLogsRequestBody {}

export type GetIntegrationLogsInput = GetIntegrationLogsRequestBody & GetIntegrationLogsRequestHeaders & GetIntegrationLogsRequestQuery & GetIntegrationLogsRequestParams

export type GetIntegrationLogsRequest = {
  headers: GetIntegrationLogsRequestHeaders;
  query: GetIntegrationLogsRequestQuery;
  params: GetIntegrationLogsRequestParams;
  body: GetIntegrationLogsRequestBody;
}

export const parseReq = (input: GetIntegrationLogsInput): GetIntegrationLogsRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations/${encodeURIComponent(input['id'])}/logs`,
    headers: {  },
    query: { 'timeStart': input['timeStart'], 'timeEnd': input['timeEnd'], 'level': input['level'], 'userId': input['userId'], 'conversationId': input['conversationId'], 'messageContains': input['messageContains'], 'nextToken': input['nextToken'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetIntegrationLogsResponse {
  logs: {
    timestamp: string;
    level: string;
    message: string;
    workflowId?: string;
    userId?: string;
    conversationId?: string;
  }[];
  nextToken?: string;
}

