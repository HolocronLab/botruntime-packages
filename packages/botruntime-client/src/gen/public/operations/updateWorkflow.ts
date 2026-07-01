// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpdateWorkflowRequestHeaders {}

export interface UpdateWorkflowRequestQuery {}

export interface UpdateWorkflowRequestParams {
  id: string;
}

export interface UpdateWorkflowRequestBody {
  /**
   * Content related to the workflow
   */
  output?: {
    [k: string]: any;
  };
  /**
   * The timeout date where the workflow should be failed in the ISO 8601 format
   */
  timeoutAt?: string;
  /**
   * Status of the workflow
   */
  status?: "completed" | "cancelled" | "listening" | "paused" | "failed" | "in_progress";
  /**
   * Reason why the workflow failed
   */
  failureReason?: string;
  /**
   * Tags for the [Workflow](#schema_workflow). Set to null or empty string to remove.
   */
  tags?: {
    [k: string]: string | null;
  };
  /**
   * Specific user related to this workflow
   */
  userId?: string;
  /**
   * Event id must be specified if the workflow is updated with the status in_progress
   */
  eventId?: string;
}

export type UpdateWorkflowInput = UpdateWorkflowRequestBody & UpdateWorkflowRequestHeaders & UpdateWorkflowRequestQuery & UpdateWorkflowRequestParams

export type UpdateWorkflowRequest = {
  headers: UpdateWorkflowRequestHeaders;
  query: UpdateWorkflowRequestQuery;
  params: UpdateWorkflowRequestParams;
  body: UpdateWorkflowRequestBody;
}

export const parseReq = (input: UpdateWorkflowInput): UpdateWorkflowRequest & { path: string } => {
  return {
    path: `/v1/chat/workflows/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'output': input['output'], 'timeoutAt': input['timeoutAt'], 'status': input['status'], 'failureReason': input['failureReason'], 'tags': input['tags'], 'userId': input['userId'], 'eventId': input['eventId'] },
  }
}

export interface UpdateWorkflowResponse {
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

