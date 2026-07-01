// this file was automatically generated, do not edit
/* eslint-disable */

export interface TrackAnalyticsRequestHeaders {}

export interface TrackAnalyticsRequestQuery {}

export interface TrackAnalyticsRequestParams {}

export interface TrackAnalyticsRequestBody {
  name: string;
  count: number;
}

export type TrackAnalyticsInput = TrackAnalyticsRequestBody & TrackAnalyticsRequestHeaders & TrackAnalyticsRequestQuery & TrackAnalyticsRequestParams

export type TrackAnalyticsRequest = {
  headers: TrackAnalyticsRequestHeaders;
  query: TrackAnalyticsRequestQuery;
  params: TrackAnalyticsRequestParams;
  body: TrackAnalyticsRequestBody;
}

export const parseReq = (input: TrackAnalyticsInput): TrackAnalyticsRequest & { path: string } => {
  return {
    path: `/v1/chat/analytics`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'name': input['name'], 'count': input['count'] },
  }
}

export interface TrackAnalyticsResponse {}

