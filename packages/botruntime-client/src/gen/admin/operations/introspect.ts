// this file was automatically generated, do not edit
/* eslint-disable */

export interface IntrospectRequestHeaders {}

export interface IntrospectRequestQuery {}

export interface IntrospectRequestParams {}

export interface IntrospectRequestBody {
  botId: string;
}

export type IntrospectInput = IntrospectRequestBody & IntrospectRequestHeaders & IntrospectRequestQuery & IntrospectRequestParams

export type IntrospectRequest = {
  headers: IntrospectRequestHeaders;
  query: IntrospectRequestQuery;
  params: IntrospectRequestParams;
  body: IntrospectRequestBody;
}

export const parseReq = (input: IntrospectInput): IntrospectRequest & { path: string } => {
  return {
    path: `/v1/admin/introspect`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'botId': input['botId'] },
  }
}

export interface IntrospectResponse {
  workspaceId: string;
  botId: string;
  userId: string;
}

