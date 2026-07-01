// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetBotAnalyticsRequestHeaders {}

export interface GetBotAnalyticsRequestQuery {
  startDate: string;
  endDate: string;
}

export interface GetBotAnalyticsRequestParams {
  id: string;
}

export interface GetBotAnalyticsRequestBody {}

export type GetBotAnalyticsInput = GetBotAnalyticsRequestBody & GetBotAnalyticsRequestHeaders & GetBotAnalyticsRequestQuery & GetBotAnalyticsRequestParams

export type GetBotAnalyticsRequest = {
  headers: GetBotAnalyticsRequestHeaders;
  query: GetBotAnalyticsRequestQuery;
  params: GetBotAnalyticsRequestParams;
  body: GetBotAnalyticsRequestBody;
}

export const parseReq = (input: GetBotAnalyticsInput): GetBotAnalyticsRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/analytics`,
    headers: {  },
    query: { 'startDate': input['startDate'], 'endDate': input['endDate'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetBotAnalyticsResponse {
  records: {
    /**
     * ISO 8601 date string of the beginning (inclusive) of the period
     */
    startDateTimeUtc: string;
    /**
     * ISO 8601 date string of the end (inclusive) of the period
     */
    endDateTimeUtc: string;
    returningUsers: number;
    newUsers: number;
    sessions: number;
    /**
     * Deprecated. Use `userMessages` instead.
     */
    messages: number;
    userMessages: number;
    botMessages: number;
    events: number;
    eventTypes: {
      [k: string]: number;
    };
    customEvents: {
      [k: string]: number;
    };
    llm: {
      calls: number;
      errors: number;
      inputTokens: number;
      outputTokens: number;
      /**
       * The time it took for the LLM to complete its response. Values are expressed in milliseconds
       */
      latency: {
        mean: number;
        sd: number;
        min: number;
        max: number;
      };
      /**
       * LLM response generation speed expressed in output tokens per second.
       */
      tokensPerSecond: {
        mean: number;
        sd: number;
        min: number;
        max: number;
      };
      /**
       * Values are expressed in U.S. dollars
       */
      cost: {
        sum: number;
        mean: number;
        sd: number;
        min: number;
        max: number;
      };
    };
  }[];
}

