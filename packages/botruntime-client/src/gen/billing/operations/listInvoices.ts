// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListInvoicesRequestHeaders {}

export interface ListInvoicesRequestQuery {
  nextToken?: string;
  pageSize?: number;
}

export interface ListInvoicesRequestParams {}

export interface ListInvoicesRequestBody {}

export type ListInvoicesInput = ListInvoicesRequestBody & ListInvoicesRequestHeaders & ListInvoicesRequestQuery & ListInvoicesRequestParams

export type ListInvoicesRequest = {
  headers: ListInvoicesRequestHeaders;
  query: ListInvoicesRequestQuery;
  params: ListInvoicesRequestParams;
  body: ListInvoicesRequestBody;
}

export const parseReq = (input: ListInvoicesInput): ListInvoicesRequest & { path: string } => {
  return {
    path: `/v2/billing/invoices`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'] },
    params: {  },
    body: {  },
  }
}

export interface ListInvoicesResponse {
  invoices: {
    id: string;
    /**
     * Invoice amount in dollars
     */
    amount: number;
    currency: string;
    status: "draft" | "open" | "paid" | "uncollectible" | "void";
    createdAt: string;
    periodStart: string | null;
    periodEnd: string | null;
    dueDate: string | null;
    pdfUrl: string | null;
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

