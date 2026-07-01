// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateIntegrationShareableIdRequestHeaders {}

export interface CreateIntegrationShareableIdRequestQuery {
  integrationInstanceAlias?: string;
}

export interface CreateIntegrationShareableIdRequestParams {
  botId: string;
  integrationId: string;
}

export interface CreateIntegrationShareableIdRequestBody {}

export type CreateIntegrationShareableIdInput = CreateIntegrationShareableIdRequestBody & CreateIntegrationShareableIdRequestHeaders & CreateIntegrationShareableIdRequestQuery & CreateIntegrationShareableIdRequestParams

export type CreateIntegrationShareableIdRequest = {
  headers: CreateIntegrationShareableIdRequestHeaders;
  query: CreateIntegrationShareableIdRequestQuery;
  params: CreateIntegrationShareableIdRequestParams;
  body: CreateIntegrationShareableIdRequestBody;
}

export const parseReq = (input: CreateIntegrationShareableIdInput): CreateIntegrationShareableIdRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['botId'])}/integrations/${encodeURIComponent(input['integrationId'])}/shareable-id`,
    headers: {  },
    query: { 'integrationInstanceAlias': input['integrationInstanceAlias'] },
    params: { 'botId': input['botId'], 'integrationId': input['integrationId'] },
    body: {  },
  }
}

export interface CreateIntegrationShareableIdResponse {
  shareableId: string;
}

