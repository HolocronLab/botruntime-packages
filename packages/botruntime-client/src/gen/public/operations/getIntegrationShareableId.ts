// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetIntegrationShareableIdRequestHeaders {}

export interface GetIntegrationShareableIdRequestQuery {
  integrationInstanceAlias?: string;
}

export interface GetIntegrationShareableIdRequestParams {
  botId: string;
  integrationId: string;
}

export interface GetIntegrationShareableIdRequestBody {}

export type GetIntegrationShareableIdInput = GetIntegrationShareableIdRequestBody & GetIntegrationShareableIdRequestHeaders & GetIntegrationShareableIdRequestQuery & GetIntegrationShareableIdRequestParams

export type GetIntegrationShareableIdRequest = {
  headers: GetIntegrationShareableIdRequestHeaders;
  query: GetIntegrationShareableIdRequestQuery;
  params: GetIntegrationShareableIdRequestParams;
  body: GetIntegrationShareableIdRequestBody;
}

export const parseReq = (input: GetIntegrationShareableIdInput): GetIntegrationShareableIdRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['botId'])}/integrations/${encodeURIComponent(input['integrationId'])}/shareable-id`,
    headers: {  },
    query: { 'integrationInstanceAlias': input['integrationInstanceAlias'] },
    params: { 'botId': input['botId'], 'integrationId': input['integrationId'] },
    body: {  },
  }
}

export interface GetIntegrationShareableIdResponse {
  shareableId: string;
  isExpired: boolean;
}

