// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListBotIssueEventsRequestHeaders {}

export interface ListBotIssueEventsRequestQuery {}

export interface ListBotIssueEventsRequestParams {
  id: string;
  issueId: string;
}

export interface ListBotIssueEventsRequestBody {}

export type ListBotIssueEventsInput = ListBotIssueEventsRequestBody & ListBotIssueEventsRequestHeaders & ListBotIssueEventsRequestQuery & ListBotIssueEventsRequestParams

export type ListBotIssueEventsRequest = {
  headers: ListBotIssueEventsRequestHeaders;
  query: ListBotIssueEventsRequestQuery;
  params: ListBotIssueEventsRequestParams;
  body: ListBotIssueEventsRequestBody;
}

export const parseReq = (input: ListBotIssueEventsInput): ListBotIssueEventsRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/issues/${encodeURIComponent(input['issueId'])}/events`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'], 'issueId': input['issueId'] },
    body: {  },
  }
}

export interface ListBotIssueEventsResponse {
  issueEvents: {
    id: string;
    createdAt: string;
    data: {
      [k: string]: {
        raw: string;
        pretty?: string;
      };
    };
  }[];
}

