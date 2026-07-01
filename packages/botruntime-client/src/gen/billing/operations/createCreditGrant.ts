// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateCreditGrantRequestHeaders {}

export interface CreateCreditGrantRequestQuery {}

export interface CreateCreditGrantRequestParams {}

export interface CreateCreditGrantRequestBody {
  /**
   * Nanodollar value of the credit grant (e.g. 10_000_000_000 = $10.00 USD)
   */
  amount: number;
  feature: "ai_spend";
}

export type CreateCreditGrantInput = CreateCreditGrantRequestBody & CreateCreditGrantRequestHeaders & CreateCreditGrantRequestQuery & CreateCreditGrantRequestParams

export type CreateCreditGrantRequest = {
  headers: CreateCreditGrantRequestHeaders;
  query: CreateCreditGrantRequestQuery;
  params: CreateCreditGrantRequestParams;
  body: CreateCreditGrantRequestBody;
}

export const parseReq = (input: CreateCreditGrantInput): CreateCreditGrantRequest & { path: string } => {
  return {
    path: `/v2/billing/credit-grants`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'amount': input['amount'], 'feature': input['feature'] },
  }
}

export interface CreateCreditGrantResponse {
  id: string;
  workspace_id: string;
  invoice_id: string;
  /**
   * Dollar value of the credit grant (e.g. 10 = $10.00 USD)
   */
  amount: number;
  feature:
    | "incoming_messages_events"
    | "integration_spend"
    | "table_rows"
    | "bot_count"
    | "collaborator_count"
    | "file_storage"
    | "vector_db_storage"
    | "saved_versions"
    | "indexed_file_count"
    | "conversation_sessions"
    | "ai_spend";
  /**
   * Start of the period (inclusive)
   */
  period_start: string;
  /**
   * End of the period (exclusive)
   */
  period_end: string;
  updatedAt: string;
  createdAt: string;
}

