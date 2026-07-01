// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteBotIssueRequestHeaders {}

export interface DeleteBotIssueRequestQuery {}

export interface DeleteBotIssueRequestParams {
  id: string;
  issueId: string;
}

export interface DeleteBotIssueRequestBody {}

export type DeleteBotIssueInput = DeleteBotIssueRequestBody & DeleteBotIssueRequestHeaders & DeleteBotIssueRequestQuery & DeleteBotIssueRequestParams

export type DeleteBotIssueRequest = {
  headers: DeleteBotIssueRequestHeaders;
  query: DeleteBotIssueRequestQuery;
  params: DeleteBotIssueRequestParams;
  body: DeleteBotIssueRequestBody;
}

export const parseReq = (input: DeleteBotIssueInput): DeleteBotIssueRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/issues/${encodeURIComponent(input['issueId'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'], 'issueId': input['issueId'] },
    body: {  },
  }
}

export interface DeleteBotIssueResponse {}

