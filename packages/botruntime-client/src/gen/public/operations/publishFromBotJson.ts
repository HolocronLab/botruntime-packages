// this file was automatically generated, do not edit
/* eslint-disable */

export interface PublishFromBotJsonRequestHeaders {}

export interface PublishFromBotJsonRequestQuery {}

export interface PublishFromBotJsonRequestParams {
  id: string;
}

export interface PublishFromBotJsonRequestBody {
  botJson: {
    [k: string]: any;
  };
}

export type PublishFromBotJsonInput = PublishFromBotJsonRequestBody & PublishFromBotJsonRequestHeaders & PublishFromBotJsonRequestQuery & PublishFromBotJsonRequestParams

export type PublishFromBotJsonRequest = {
  headers: PublishFromBotJsonRequestHeaders;
  query: PublishFromBotJsonRequestQuery;
  params: PublishFromBotJsonRequestParams;
  body: PublishFromBotJsonRequestBody;
}

export const parseReq = (input: PublishFromBotJsonInput): PublishFromBotJsonRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/publish-from-bot-json`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'botJson': input['botJson'] },
  }
}

export interface PublishFromBotJsonResponse {
  [k: string]: any;
}

