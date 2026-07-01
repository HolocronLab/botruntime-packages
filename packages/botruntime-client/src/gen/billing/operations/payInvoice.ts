// this file was automatically generated, do not edit
/* eslint-disable */

export interface PayInvoiceRequestHeaders {}

export interface PayInvoiceRequestQuery {}

export interface PayInvoiceRequestParams {
  invoiceId: string;
}

export interface PayInvoiceRequestBody {
  idempotencyKey?: string;
}

export type PayInvoiceInput = PayInvoiceRequestBody & PayInvoiceRequestHeaders & PayInvoiceRequestQuery & PayInvoiceRequestParams

export type PayInvoiceRequest = {
  headers: PayInvoiceRequestHeaders;
  query: PayInvoiceRequestQuery;
  params: PayInvoiceRequestParams;
  body: PayInvoiceRequestBody;
}

export const parseReq = (input: PayInvoiceInput): PayInvoiceRequest & { path: string } => {
  return {
    path: `/v2/billing/invoices/${encodeURIComponent(input['invoiceId'])}/pay`,
    headers: {  },
    query: {  },
    params: { 'invoiceId': input['invoiceId'] },
    body: { 'idempotencyKey': input['idempotencyKey'] },
  }
}

export interface PayInvoiceResponse {
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
}

