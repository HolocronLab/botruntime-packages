// this file was automatically generated, do not edit
/* eslint-disable */

export interface UnlinkSandboxedConversationsRequestHeaders {}

export interface UnlinkSandboxedConversationsRequestQuery {
  integrationInstanceAlias?: string;
}

export interface UnlinkSandboxedConversationsRequestParams {
  botId: string;
  integrationId: string;
}

export interface UnlinkSandboxedConversationsRequestBody {}

export type UnlinkSandboxedConversationsInput = UnlinkSandboxedConversationsRequestBody & UnlinkSandboxedConversationsRequestHeaders & UnlinkSandboxedConversationsRequestQuery & UnlinkSandboxedConversationsRequestParams

export type UnlinkSandboxedConversationsRequest = {
  headers: UnlinkSandboxedConversationsRequestHeaders;
  query: UnlinkSandboxedConversationsRequestQuery;
  params: UnlinkSandboxedConversationsRequestParams;
  body: UnlinkSandboxedConversationsRequestBody;
}

export const parseReq = (input: UnlinkSandboxedConversationsInput): UnlinkSandboxedConversationsRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['botId'])}/integrations/${encodeURIComponent(input['integrationId'])}/sandboxed-conversations`,
    headers: {  },
    query: { 'integrationInstanceAlias': input['integrationInstanceAlias'] },
    params: { 'botId': input['botId'], 'integrationId': input['integrationId'] },
    body: {  },
  }
}

export interface UnlinkSandboxedConversationsResponse {}

