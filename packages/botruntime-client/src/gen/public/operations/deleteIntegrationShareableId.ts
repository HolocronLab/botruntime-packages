// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteIntegrationShareableIdRequestHeaders {}

export interface DeleteIntegrationShareableIdRequestQuery {
  integrationInstanceAlias?: string;
}

export interface DeleteIntegrationShareableIdRequestParams {
  botId: string;
  integrationId: string;
}

export interface DeleteIntegrationShareableIdRequestBody {}

export type DeleteIntegrationShareableIdInput = DeleteIntegrationShareableIdRequestBody & DeleteIntegrationShareableIdRequestHeaders & DeleteIntegrationShareableIdRequestQuery & DeleteIntegrationShareableIdRequestParams

export type DeleteIntegrationShareableIdRequest = {
  headers: DeleteIntegrationShareableIdRequestHeaders;
  query: DeleteIntegrationShareableIdRequestQuery;
  params: DeleteIntegrationShareableIdRequestParams;
  body: DeleteIntegrationShareableIdRequestBody;
}

export const parseReq = (input: DeleteIntegrationShareableIdInput): DeleteIntegrationShareableIdRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['botId'])}/integrations/${encodeURIComponent(input['integrationId'])}/shareable-id`,
    headers: {  },
    query: { 'integrationInstanceAlias': input['integrationInstanceAlias'] },
    params: { 'botId': input['botId'], 'integrationId': input['integrationId'] },
    body: {  },
  }
}

export interface DeleteIntegrationShareableIdResponse {}

