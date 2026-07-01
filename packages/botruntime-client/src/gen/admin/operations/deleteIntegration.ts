// this file was automatically generated, do not edit
/* eslint-disable */

export interface DeleteIntegrationRequestHeaders {}

export interface DeleteIntegrationRequestQuery {}

export interface DeleteIntegrationRequestParams {
  id: string;
}

export interface DeleteIntegrationRequestBody {}

export type DeleteIntegrationInput = DeleteIntegrationRequestBody & DeleteIntegrationRequestHeaders & DeleteIntegrationRequestQuery & DeleteIntegrationRequestParams

export type DeleteIntegrationRequest = {
  headers: DeleteIntegrationRequestHeaders;
  query: DeleteIntegrationRequestQuery;
  params: DeleteIntegrationRequestParams;
  body: DeleteIntegrationRequestBody;
}

export const parseReq = (input: DeleteIntegrationInput): DeleteIntegrationRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface DeleteIntegrationResponse {}

