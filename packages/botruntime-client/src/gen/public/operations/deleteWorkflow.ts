// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteWorkflowRequestHeaders {}

export interface DeleteWorkflowRequestQuery {}

export interface DeleteWorkflowRequestParams {
  id: string;
}

export interface DeleteWorkflowRequestBody {}

export type DeleteWorkflowInput = DeleteWorkflowRequestBody & DeleteWorkflowRequestHeaders & DeleteWorkflowRequestQuery & DeleteWorkflowRequestParams

export type DeleteWorkflowRequest = {
  headers: DeleteWorkflowRequestHeaders;
  query: DeleteWorkflowRequestQuery;
  params: DeleteWorkflowRequestParams;
  body: DeleteWorkflowRequestBody;
}

export const parseReq = (input: DeleteWorkflowInput): DeleteWorkflowRequest & { path: string } => {
  return {
    path: `/v1/chat/workflows/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteWorkflowResponse {}

