// this file was automatically generated, do not edit
/* eslint-disable */

export interface CancelScheduledEventRequestHeaders {}

export interface CancelScheduledEventRequestQuery {}

export interface CancelScheduledEventRequestParams {
  id: string;
}

export interface CancelScheduledEventRequestBody {}

export type CancelScheduledEventInput = CancelScheduledEventRequestBody & CancelScheduledEventRequestHeaders & CancelScheduledEventRequestQuery & CancelScheduledEventRequestParams

export type CancelScheduledEventRequest = {
  headers: CancelScheduledEventRequestHeaders;
  query: CancelScheduledEventRequestQuery;
  params: CancelScheduledEventRequestParams;
  body: CancelScheduledEventRequestBody;
}

export const parseReq = (input: CancelScheduledEventInput): CancelScheduledEventRequest & { path: string } => {
  return {
    path: `/v1/chat/events/scheduled/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface CancelScheduledEventResponse {}

