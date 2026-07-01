// this file was automatically generated, do not edit
/* eslint-disable */

export interface CheckHandleAvailabilityRequestHeaders {}

export interface CheckHandleAvailabilityRequestQuery {}

export interface CheckHandleAvailabilityRequestParams {}

export interface CheckHandleAvailabilityRequestBody {
  handle: string;
}

export type CheckHandleAvailabilityInput = CheckHandleAvailabilityRequestBody & CheckHandleAvailabilityRequestHeaders & CheckHandleAvailabilityRequestQuery & CheckHandleAvailabilityRequestParams

export type CheckHandleAvailabilityRequest = {
  headers: CheckHandleAvailabilityRequestHeaders;
  query: CheckHandleAvailabilityRequestQuery;
  params: CheckHandleAvailabilityRequestParams;
  body: CheckHandleAvailabilityRequestBody;
}

export const parseReq = (input: CheckHandleAvailabilityInput): CheckHandleAvailabilityRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/handle-availability`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'handle': input['handle'] },
  }
}

export interface CheckHandleAvailabilityResponse {
  available: boolean;
  suggestions: string[];
  usedBy?: string;
}

