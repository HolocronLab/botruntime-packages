// this file was automatically generated, do not edit
/* eslint-disable */

export interface RotateIntegrationSigningSecretsRequestHeaders {}

export interface RotateIntegrationSigningSecretsRequestQuery {}

export interface RotateIntegrationSigningSecretsRequestParams {
  id: string;
}

export interface RotateIntegrationSigningSecretsRequestBody {}

export type RotateIntegrationSigningSecretsInput = RotateIntegrationSigningSecretsRequestBody & RotateIntegrationSigningSecretsRequestHeaders & RotateIntegrationSigningSecretsRequestQuery & RotateIntegrationSigningSecretsRequestParams

export type RotateIntegrationSigningSecretsRequest = {
  headers: RotateIntegrationSigningSecretsRequestHeaders;
  query: RotateIntegrationSigningSecretsRequestQuery;
  params: RotateIntegrationSigningSecretsRequestParams;
  body: RotateIntegrationSigningSecretsRequestBody;
}

export const parseReq = (input: RotateIntegrationSigningSecretsInput): RotateIntegrationSigningSecretsRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations/${encodeURIComponent(input['id'])}/signing-secrets/rotate`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface RotateIntegrationSigningSecretsResponse {
  /**
   * The new signing secret that can be used immediately. The old signing secret(s) will continue to work for 24 hours after this operation to allow for a smooth transition.
   */
  newSigningSecret: string;
}

