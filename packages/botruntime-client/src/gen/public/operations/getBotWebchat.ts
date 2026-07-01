// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetBotWebchatRequestHeaders {}

export interface GetBotWebchatRequestQuery {
  type: "preconfigured" | "configurable" | "fullscreen" | "sharableUrl";
}

export interface GetBotWebchatRequestParams {
  id: string;
}

export interface GetBotWebchatRequestBody {}

export type GetBotWebchatInput = GetBotWebchatRequestBody & GetBotWebchatRequestHeaders & GetBotWebchatRequestQuery & GetBotWebchatRequestParams

export type GetBotWebchatRequest = {
  headers: GetBotWebchatRequestHeaders;
  query: GetBotWebchatRequestQuery;
  params: GetBotWebchatRequestParams;
  body: GetBotWebchatRequestBody;
}

export const parseReq = (input: GetBotWebchatInput): GetBotWebchatRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/webchat`,
    headers: {  },
    query: { 'type': input['type'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetBotWebchatResponse {
  code: string;
}

