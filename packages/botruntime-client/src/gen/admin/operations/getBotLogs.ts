// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetBotLogsRequestHeaders {}

export interface GetBotLogsRequestQuery {
  timeStart: string;
  timeEnd?: string;
  level?: string;
  userId?: string;
  workflowId?: string;
  conversationId?: string;
  messageContains?: string;
  nextToken?: string;
}

export interface GetBotLogsRequestParams {
  id: string;
}

export interface GetBotLogsRequestBody {}

export type GetBotLogsInput = GetBotLogsRequestBody & GetBotLogsRequestHeaders & GetBotLogsRequestQuery & GetBotLogsRequestParams

export type GetBotLogsRequest = {
  headers: GetBotLogsRequestHeaders;
  query: GetBotLogsRequestQuery;
  params: GetBotLogsRequestParams;
  body: GetBotLogsRequestBody;
}

export const parseReq = (input: GetBotLogsInput): GetBotLogsRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/logs`,
    headers: {  },
    query: { 'timeStart': input['timeStart'], 'timeEnd': input['timeEnd'], 'level': input['level'], 'userId': input['userId'], 'workflowId': input['workflowId'], 'conversationId': input['conversationId'], 'messageContains': input['messageContains'], 'nextToken': input['nextToken'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetBotLogsResponse {
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

