// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetWorkflowRequestHeaders {}

export interface GetWorkflowRequestQuery {}

export interface GetWorkflowRequestParams {
  id: string;
}

export interface GetWorkflowRequestBody {}

export type GetWorkflowInput = GetWorkflowRequestBody & GetWorkflowRequestHeaders & GetWorkflowRequestQuery & GetWorkflowRequestParams

export type GetWorkflowRequest = {
  headers: GetWorkflowRequestHeaders;
  query: GetWorkflowRequestQuery;
  params: GetWorkflowRequestParams;
  body: GetWorkflowRequestBody;
}

export const parseReq = (input: GetWorkflowInput): GetWorkflowRequest & { path: string } => {
  return {
    path: `/v1/chat/workflows/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetWorkflowResponse {
  /**
   * Workflow definition
   */
  workflow: {
    /**
     * Id of the [Workflow](#schema_workflow)
     */
    id: string;
    /**
     * Name of the workflow
     */
    name: string;
    /**
     * Status of the [Workflow](#schema_workflow)
     */
    status: "pending" | "in_progress" | "failed" | "completed" | "listening" | "paused" | "timedout" | "cancelled";
    /**
     * Input provided to the [Workflow](#schema_workflow)
     */
    input: {
      [k: string]: any;
    };
    /**
     * Data returned by the [Workflow](#schema_workflow) output
     */
    output: {
      [k: string]: any;
    };
    /**
     * Parent [Workflow](#schema_workflow) id is the parent [Workflow](#schema_workflow) that created this [Workflow](#schema_workflow)
     */
    parentWorkflowId?: string;
    /**
     * Conversation id related to this [Workflow](#schema_workflow)
     */
    conversationId?: string;
    /**
     * User id related to this [Workflow](#schema_workflow)
     */
    userId?: string;
    /**
     * Creation date of the [Workflow](#schema_workflow) in ISO 8601 format
     */
    createdAt: string;
    /**
     * Updating date of the [Workflow](#schema_workflow) in ISO 8601 format
     */
    updatedAt: string;
    /**
     * The date when the [Workflow](#schema_workflow) completed in ISO 8601 format
     */
    completedAt?: string;
    /**
     * If the [Workflow](#schema_workflow) fails this is the reason behind it
     */
    failureReason?: string;
    /**
     * The timeout date when the [Workflow](#schema_workflow) will fail in the ISO 8601 format
     */
    timeoutAt: string;
    /**
     * Set of [Tags](/docs/developers/concepts/tags) that you can attach to a [Workflow](#schema_workflow). Individual keys can be unset by posting an empty value to them.
     */
    tags: {
      [k: string]: string;
    };
  };
}

