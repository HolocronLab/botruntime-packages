// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteIntegrationApiKeyRequestHeaders {}

export interface DeleteIntegrationApiKeyRequestQuery {}

export interface DeleteIntegrationApiKeyRequestParams {
  id: string;
}

export interface DeleteIntegrationApiKeyRequestBody {}

export type DeleteIntegrationApiKeyInput = DeleteIntegrationApiKeyRequestBody & DeleteIntegrationApiKeyRequestHeaders & DeleteIntegrationApiKeyRequestQuery & DeleteIntegrationApiKeyRequestParams

export type DeleteIntegrationApiKeyRequest = {
  headers: DeleteIntegrationApiKeyRequestHeaders;
  query: DeleteIntegrationApiKeyRequestQuery;
  params: DeleteIntegrationApiKeyRequestParams;
  body: DeleteIntegrationApiKeyRequestBody;
}

export const parseReq = (input: DeleteIntegrationApiKeyInput): DeleteIntegrationApiKeyRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations/iaks/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteIntegrationApiKeyResponse {}

