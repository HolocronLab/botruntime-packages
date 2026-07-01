// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateIntegrationApiKeyRequestHeaders {}

export interface CreateIntegrationApiKeyRequestQuery {}

export interface CreateIntegrationApiKeyRequestParams {}

export interface CreateIntegrationApiKeyRequestBody {
  integrationId: string;
  note?: string;
}

export type CreateIntegrationApiKeyInput = CreateIntegrationApiKeyRequestBody & CreateIntegrationApiKeyRequestHeaders & CreateIntegrationApiKeyRequestQuery & CreateIntegrationApiKeyRequestParams

export type CreateIntegrationApiKeyRequest = {
  headers: CreateIntegrationApiKeyRequestHeaders;
  query: CreateIntegrationApiKeyRequestQuery;
  params: CreateIntegrationApiKeyRequestParams;
  body: CreateIntegrationApiKeyRequestBody;
}

export const parseReq = (input: CreateIntegrationApiKeyInput): CreateIntegrationApiKeyRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations/iaks`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'integrationId': input['integrationId'], 'note': input['note'] },
  }
}

export interface CreateIntegrationApiKeyResponse {
  id: string;
  createdAt: string;
  note: string;
  /**
   * The IAK value. This will only be returned here when created and cannot be retrieved later.
   */
  value: string;
}

