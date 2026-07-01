// this file was automatically generated, do not edit
/* eslint-disable */

export interface ChargeWorkspaceUnpaidInvoicesRequestHeaders {}

export interface ChargeWorkspaceUnpaidInvoicesRequestQuery {}

export interface ChargeWorkspaceUnpaidInvoicesRequestParams {
  id: string;
}

export interface ChargeWorkspaceUnpaidInvoicesRequestBody {
  /**
   * @minItems 1
   */
  invoiceIds?: string[];
}

export type ChargeWorkspaceUnpaidInvoicesInput = ChargeWorkspaceUnpaidInvoicesRequestBody & ChargeWorkspaceUnpaidInvoicesRequestHeaders & ChargeWorkspaceUnpaidInvoicesRequestQuery & ChargeWorkspaceUnpaidInvoicesRequestParams

export type ChargeWorkspaceUnpaidInvoicesRequest = {
  headers: ChargeWorkspaceUnpaidInvoicesRequestHeaders;
  query: ChargeWorkspaceUnpaidInvoicesRequestQuery;
  params: ChargeWorkspaceUnpaidInvoicesRequestParams;
  body: ChargeWorkspaceUnpaidInvoicesRequestBody;
}

export const parseReq = (input: ChargeWorkspaceUnpaidInvoicesInput): ChargeWorkspaceUnpaidInvoicesRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/${encodeURIComponent(input['id'])}/billing/invoices/charge-unpaid`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'invoiceIds': input['invoiceIds'] },
  }
}

export interface ChargeWorkspaceUnpaidInvoicesResponse {
  /**
   * Invoices that were successfully charged by this request.
   */
  chargedInvoices: {
    id: string;
    amount: number;
  }[];
  /**
   * Invoices that failed to be charged by this request.
   */
  failedInvoices: {
    id: string;
    amount: number;
    failedReason: string;
  }[];
}

