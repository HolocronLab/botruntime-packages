// this file was automatically generated, do not edit
/* eslint-disable */

export interface RotateBotSigningSecretsRequestHeaders {}

export interface RotateBotSigningSecretsRequestQuery {}

export interface RotateBotSigningSecretsRequestParams {
  id: string;
}

export interface RotateBotSigningSecretsRequestBody {}

export type RotateBotSigningSecretsInput = RotateBotSigningSecretsRequestBody & RotateBotSigningSecretsRequestHeaders & RotateBotSigningSecretsRequestQuery & RotateBotSigningSecretsRequestParams

export type RotateBotSigningSecretsRequest = {
  headers: RotateBotSigningSecretsRequestHeaders;
  query: RotateBotSigningSecretsRequestQuery;
  params: RotateBotSigningSecretsRequestParams;
  body: RotateBotSigningSecretsRequestBody;
}

export const parseReq = (input: RotateBotSigningSecretsInput): RotateBotSigningSecretsRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/signing-secrets/rotate`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface RotateBotSigningSecretsResponse {
  /**
   * The new signing secret that can be used immediately. The old signing secret(s) will continue to work for 24 hours after this operation to allow for a smooth transition.
   */
  newSigningSecret: string;
}

