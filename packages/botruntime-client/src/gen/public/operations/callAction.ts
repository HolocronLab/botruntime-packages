// this file was automatically generated, do not edit
/* eslint-disable */

export interface CallActionRequestHeaders {}

export interface CallActionRequestQuery {}

export interface CallActionRequestParams {}

export interface CallActionRequestBody {
  /**
   * Type of the action
   */
  type: string;
  /**
   * Input of the action
   */
  input: {
    [k: string]: any;
  };
}

export type CallActionInput = CallActionRequestBody & CallActionRequestHeaders & CallActionRequestQuery & CallActionRequestParams

export type CallActionRequest = {
  headers: CallActionRequestHeaders;
  query: CallActionRequestQuery;
  params: CallActionRequestParams;
  body: CallActionRequestBody;
}

export const parseReq = (input: CallActionInput): CallActionRequest & { path: string } => {
  return {
    path: `/v1/chat/actions`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'type': input['type'], 'input': input['input'] },
  }
}

export interface CallActionResponse {
  /**
   * Input of the action
   */
  output: {
    [k: string]: any;
  };
  meta: {
    cached: boolean;
  };
}

