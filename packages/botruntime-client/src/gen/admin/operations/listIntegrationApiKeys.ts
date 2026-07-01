// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListIntegrationApiKeysRequestHeaders {}

export interface ListIntegrationApiKeysRequestQuery {
  integrationId: string;
}

export interface ListIntegrationApiKeysRequestParams {}

export interface ListIntegrationApiKeysRequestBody {}

export type ListIntegrationApiKeysInput = ListIntegrationApiKeysRequestBody & ListIntegrationApiKeysRequestHeaders & ListIntegrationApiKeysRequestQuery & ListIntegrationApiKeysRequestParams

export type ListIntegrationApiKeysRequest = {
  headers: ListIntegrationApiKeysRequestHeaders;
  query: ListIntegrationApiKeysRequestQuery;
  params: ListIntegrationApiKeysRequestParams;
  body: ListIntegrationApiKeysRequestBody;
}

export const parseReq = (input: ListIntegrationApiKeysInput): ListIntegrationApiKeysRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations/iaks`,
    headers: {  },
    query: { 'integrationId': input['integrationId'] },
    params: {  },
    body: {  },
  }
}

export interface ListIntegrationApiKeysResponse {
  iaks: {
    id: string;
    createdAt: string;
    note: string;
  }[];
}

