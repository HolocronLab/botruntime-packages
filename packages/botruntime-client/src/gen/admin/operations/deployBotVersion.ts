// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeployBotVersionRequestHeaders {}

export interface DeployBotVersionRequestQuery {}

export interface DeployBotVersionRequestParams {
  id: string;
}

export interface DeployBotVersionRequestBody {
  versionId: string;
}

export type DeployBotVersionInput = DeployBotVersionRequestBody & DeployBotVersionRequestHeaders & DeployBotVersionRequestQuery & DeployBotVersionRequestParams

export type DeployBotVersionRequest = {
  headers: DeployBotVersionRequestHeaders;
  query: DeployBotVersionRequestQuery;
  params: DeployBotVersionRequestParams;
  body: DeployBotVersionRequestBody;
}

export const parseReq = (input: DeployBotVersionInput): DeployBotVersionRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/versions/deploy`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'versionId': input['versionId'] },
  }
}

export interface DeployBotVersionResponse {}

