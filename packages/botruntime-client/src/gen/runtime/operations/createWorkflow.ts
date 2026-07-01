// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateWorkflowRequestHeaders {}

export interface CreateWorkflowRequestQuery {}

export interface CreateWorkflowRequestParams {}

export interface CreateWorkflowRequestBody {
  /**
   * Name of the workflow
   */
  name: string;
  /**
   * Content related to the workflow
   */
  input?: {
    [k: string]: any;
  };
  /**
   * Parent workflow id is the parent workflow that created this workflow
   */
  parentWorkflowId?: string;
  /**
   * Conversation id related to this workflow
   */
  conversationId?: string;
  /**
   * Specific user related to this workflow
   */
  userId?: string;
  /**
   * The timeout date where the workflow should be failed in the ISO 8601 format
   */
  timeoutAt?: string;
  /**
   * Tags for the [Workflow](#schema_workflow)
   */
  tags?: {
    [k: string]: string;
  };
  status: "pending" | "in_progress" | "listening";
  /**
   * Event id must be specified if the workflow is created with the status in_progress
   */
  eventId?: string;
}

export type CreateWorkflowInput = CreateWorkflowRequestBody & CreateWorkflowRequestHeaders & CreateWorkflowRequestQuery & CreateWorkflowRequestParams

export type CreateWorkflowRequest = {
  headers: CreateWorkflowRequestHeaders;
  query: CreateWorkflowRequestQuery;
  params: CreateWorkflowRequestParams;
  body: CreateWorkflowRequestBody;
}

export const parseReq = (input: CreateWorkflowInput): CreateWorkflowRequest & { path: string } => {
  return {
    path: `/v1/chat/workflows`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'name': input['name'], 'input': input['input'], 'parentWorkflowId': input['parentWorkflowId'], 'conversationId': input['conversationId'], 'userId': input['userId'], 'timeoutAt': input['timeoutAt'], 'tags': input['tags'], 'status': input['status'], 'eventId': input['eventId'] },
  }
}

export interface CreateWorkflowResponse {
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

