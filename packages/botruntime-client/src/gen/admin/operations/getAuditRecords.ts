// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetAuditRecordsRequestHeaders {}

export interface GetAuditRecordsRequestQuery {
  nextToken?: string;
  pageSize?: number;
}

export interface GetAuditRecordsRequestParams {
  id: string;
}

export interface GetAuditRecordsRequestBody {}

export type GetAuditRecordsInput = GetAuditRecordsRequestBody & GetAuditRecordsRequestHeaders & GetAuditRecordsRequestQuery & GetAuditRecordsRequestParams

export type GetAuditRecordsRequest = {
  headers: GetAuditRecordsRequestHeaders;
  query: GetAuditRecordsRequestQuery;
  params: GetAuditRecordsRequestParams;
  body: GetAuditRecordsRequestBody;
}

export const parseReq = (input: GetAuditRecordsInput): GetAuditRecordsRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/${encodeURIComponent(input['id'])}/audit-records`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetAuditRecordsResponse {
  records: {
    id: string;
    recordedAt: string;
    userId: string | null;
    userEmail?: string | null;
    resourceId: string | null;
    resourceName?: string | null;
    value?: string | null;
    action:
      | "UNKNOWN"
      | "ADD_WORKSPACE_MEMBER"
      | "REMOVE_WORKSPACE_MEMBER"
      | "UPDATE_WORKSPACE_MEMBER"
      | "CLOSE_WORKSPACE"
      | "CREATE_BOT"
      | "CREATE_WORKSPACE"
      | "DELETE_BOT"
      | "DEPLOY_BOT"
      | "TRANSFER_BOT"
      | "DOWNLOAD_BOT_ARCHIVE"
      | "UPDATE_BOT"
      | "UPDATE_BOT_CHANNEL"
      | "UPDATE_BOT_CONFIG"
      | "UPDATE_PAYMENT_METHOD"
      | "UPDATE_WORKSPACE"
      | "SET_SPENDING_LIMIT"
      | "SET_AI_SPENDING_LIMIT"
      | "UPDATE_WORKSPACE_BILLING_READONLY"
      | "UPDATE_WORKSPACE_PLAN_READONLY"
      | "UPDATE_WORKSPACE_ADDONS_READONLY"
      | "EXECUTE_AUTO_RECHARGE_SUCCESS"
      | "EXECUTE_AUTO_RECHARGE_FAILED";
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

