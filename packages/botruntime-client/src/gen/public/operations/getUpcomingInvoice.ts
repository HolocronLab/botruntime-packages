// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetUpcomingInvoiceRequestHeaders {}

export interface GetUpcomingInvoiceRequestQuery {}

export interface GetUpcomingInvoiceRequestParams {
  id: string;
}

export interface GetUpcomingInvoiceRequestBody {}

export type GetUpcomingInvoiceInput = GetUpcomingInvoiceRequestBody & GetUpcomingInvoiceRequestHeaders & GetUpcomingInvoiceRequestQuery & GetUpcomingInvoiceRequestParams

export type GetUpcomingInvoiceRequest = {
  headers: GetUpcomingInvoiceRequestHeaders;
  query: GetUpcomingInvoiceRequestQuery;
  params: GetUpcomingInvoiceRequestParams;
  body: GetUpcomingInvoiceRequestBody;
}

export const parseReq = (input: GetUpcomingInvoiceInput): GetUpcomingInvoiceRequest & { path: string } => {
  return {
    path: `/v1/admin/workspaces/${encodeURIComponent(input['id'])}/billing/upcoming-invoice`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetUpcomingInvoiceResponse {
  /**
   * Total amount to pay of the invoice.
   */
  total: number;
  /**
   * List of items included in the invoice.
   */
  lineItems: {
    id: string;
    /**
     * Description of the line item.
     */
    description: string;
    /**
     * Total amount to pay (in cents) of the line item.
     */
    totalInCents: number;
    /**
     * Three-letter ISO currency code, in lowercase.
     */
    currency: string;
    /**
     * Price per unit (in cents) of the line item.
     */
    pricePerUnitInCents: number | null;
    /**
     * The quantity of the subscription, if the line item is a subscription or a proration.
     */
    quantity: number | null;
    /**
     * Type of the line item.
     */
    type: "invoiceitem" | "subscription";
    /**
     * Start date of the line item period.
     */
    periodStart: string | null;
    /**
     * End date of the line item period.
     */
    periodEnd: string | null;
  }[];
}

