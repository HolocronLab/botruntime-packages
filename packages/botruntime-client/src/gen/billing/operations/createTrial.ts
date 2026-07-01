// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateTrialRequestHeaders {}

export interface CreateTrialRequestQuery {}

export interface CreateTrialRequestParams {}

export interface CreateTrialRequestBody {
  lengthInDays: number;
  plan: string;
}

export type CreateTrialInput = CreateTrialRequestBody & CreateTrialRequestHeaders & CreateTrialRequestQuery & CreateTrialRequestParams

export type CreateTrialRequest = {
  headers: CreateTrialRequestHeaders;
  query: CreateTrialRequestQuery;
  params: CreateTrialRequestParams;
  body: CreateTrialRequestBody;
}

export const parseReq = (input: CreateTrialInput): CreateTrialRequest & { path: string } => {
  return {
    path: `/v2/billing/trials`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'lengthInDays': input['lengthInDays'], 'plan': input['plan'] },
  }
}

export interface CreateTrialResponse {
  id: string;
  trialPlan: string;
  fromPlan: string;
  endsAt: string;
  isActive: boolean;
}

