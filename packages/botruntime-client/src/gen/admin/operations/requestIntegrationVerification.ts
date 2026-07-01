// this file was automatically generated, do not edit
/* eslint-disable */

export interface RequestIntegrationVerificationRequestHeaders {}

export interface RequestIntegrationVerificationRequestQuery {}

export interface RequestIntegrationVerificationRequestParams {}

export interface RequestIntegrationVerificationRequestBody {
  integrationId: string;
}

export type RequestIntegrationVerificationInput = RequestIntegrationVerificationRequestBody & RequestIntegrationVerificationRequestHeaders & RequestIntegrationVerificationRequestQuery & RequestIntegrationVerificationRequestParams

export type RequestIntegrationVerificationRequest = {
  headers: RequestIntegrationVerificationRequestHeaders;
  query: RequestIntegrationVerificationRequestQuery;
  params: RequestIntegrationVerificationRequestParams;
  body: RequestIntegrationVerificationRequestBody;
}

export const parseReq = (input: RequestIntegrationVerificationInput): RequestIntegrationVerificationRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations/request-verification`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'integrationId': input['integrationId'] },
  }
}

export interface RequestIntegrationVerificationResponse {}

