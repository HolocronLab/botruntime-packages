// this file was automatically generated, do not edit
/* eslint-disable */

export interface CaptureObservationRequestHeaders {}

export interface CaptureObservationRequestQuery {}

export interface CaptureObservationRequestParams {}

export interface CaptureObservationRequestBody {
  /**
   * Caller-defined identifier for the observation (e.g. llmz context ID). Uniqueness is not enforced nor guaranteed.
   */
  id?: string;
  /**
   * Name of the observation
   */
  name: string;
  /**
   * Data of the observation
   */
  data: {
    [k: string]: any;
  };
  /**
   * ID of the message associated with the observation
   */
  messageId?: string;
  /**
   * ID of the event associated with the observation
   */
  eventId?: string;
  /**
   * ID of the conversation associated with the observation
   */
  conversationId?: string;
  /**
   * ID of the user associated with the observation
   */
  userId?: string;
  /**
   * ID of the error associated with the observation
   */
  errorId?: string;
  /**
   * ID of the trace associated with the observation
   */
  traceId?: string;
}

export type CaptureObservationInput = CaptureObservationRequestBody & CaptureObservationRequestHeaders & CaptureObservationRequestQuery & CaptureObservationRequestParams

export type CaptureObservationRequest = {
  headers: CaptureObservationRequestHeaders;
  query: CaptureObservationRequestQuery;
  params: CaptureObservationRequestParams;
  body: CaptureObservationRequestBody;
}

export const parseReq = (input: CaptureObservationInput): CaptureObservationRequest & { path: string } => {
  return {
    path: `/v1/chat/observations`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'id': input['id'], 'name': input['name'], 'data': input['data'], 'messageId': input['messageId'], 'eventId': input['eventId'], 'conversationId': input['conversationId'], 'userId': input['userId'], 'errorId': input['errorId'], 'traceId': input['traceId'] },
  }
}

export interface CaptureObservationResponse {}

