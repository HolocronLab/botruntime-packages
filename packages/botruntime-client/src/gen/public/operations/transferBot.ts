// this file was automatically generated, do not edit
/* eslint-disable */

export interface TransferBotRequestHeaders {}

export interface TransferBotRequestQuery {}

export interface TransferBotRequestParams {
  id: string;
}

export interface TransferBotRequestBody {
  /**
   * The ID of the workspace you want to transfer the bot to.
   */
  targetWorkspaceId: string;
}

export type TransferBotInput = TransferBotRequestBody & TransferBotRequestHeaders & TransferBotRequestQuery & TransferBotRequestParams

export type TransferBotRequest = {
  headers: TransferBotRequestHeaders;
  query: TransferBotRequestQuery;
  params: TransferBotRequestParams;
  body: TransferBotRequestBody;
}

export const parseReq = (input: TransferBotInput): TransferBotRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/transfer`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'targetWorkspaceId': input['targetWorkspaceId'] },
  }
}

export interface TransferBotResponse {}

