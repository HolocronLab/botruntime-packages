// this file was automatically generated, do not edit
/* eslint-disable */

export interface ChangeAispendQuotaRequestHeaders {}

export interface ChangeAispendQuotaRequestQuery {}

export interface ChangeAispendQuotaRequestParams {}

export interface ChangeAispendQuotaRequestBody {
  monthlySpendingLimit: number;
}

export type ChangeAispendQuotaInput = ChangeAispendQuotaRequestBody & ChangeAispendQuotaRequestHeaders & ChangeAispendQuotaRequestQuery & ChangeAispendQuotaRequestParams

export type ChangeAispendQuotaRequest = {
  headers: ChangeAispendQuotaRequestHeaders;
  query: ChangeAispendQuotaRequestQuery;
  params: ChangeAispendQuotaRequestParams;
  body: ChangeAispendQuotaRequestBody;
}

export const parseReq = (input: ChangeAispendQuotaInput): ChangeAispendQuotaRequest & { path: string } => {
  return {
    path: `/v1/admin/quotas/ai-spend`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'monthlySpendingLimit': input['monthlySpendingLimit'] },
  }
}

export interface ChangeAispendQuotaResponse {}

