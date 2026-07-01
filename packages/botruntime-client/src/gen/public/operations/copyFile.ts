// this file was automatically generated, do not edit
/* eslint-disable */

export interface CopyFileRequestHeaders {
  "x-destination-bot-id"?: string;
}

export interface CopyFileRequestQuery {}

export interface CopyFileRequestParams {
  idOrKey: string;
  destinationKey: string;
}

export interface CopyFileRequestBody {
  /**
   * Set to `true` to overwrite the file if it already exists, otherwise an error will be returned.
   *
   * When this endpoint is called using bot authentication, the existing file must have been originally created by the same bot making the file copy request in order to overwrite it.
   */
  overwrite?: boolean;
}

export type CopyFileInput = CopyFileRequestBody & CopyFileRequestHeaders & CopyFileRequestQuery & CopyFileRequestParams

export type CopyFileRequest = {
  headers: CopyFileRequestHeaders;
  query: CopyFileRequestQuery;
  params: CopyFileRequestParams;
  body: CopyFileRequestBody;
}

export const parseReq = (input: CopyFileInput): CopyFileRequest & { path: string } => {
  return {
    path: `/v1/files/${encodeURIComponent(input['idOrKey'])}/${encodeURIComponent(input['destinationKey'])}`,
    headers: { 'x-destination-bot-id': input['x-destination-bot-id'] },
    query: {  },
    params: { 'idOrKey': input['idOrKey'], 'destinationKey': input['destinationKey'] },
    body: { 'overwrite': input['overwrite'] },
  }
}

export interface CopyFileResponse {
  file: {
    /**
     * File ID
     */
    id: string;
    /**
     * The ID of the bot the file belongs to
     */
    botId: string;
    /**
     * Unique key for the file. Must be unique across the bot (and the integration, when applicable).
     */
    key: string;
    /**
     * URL to retrieve the file content. This URL will be ready to use once the file is uploaded.
     *
     * If the file has a `public_content` policy, this will contain the permanent public URL to retrieve the file, otherwise this will contain a temporary pre-signed URL to download the file which should be used shortly after retrieving and should not be stored long-term as the URL will expire after a short timeframe.
     */
    url: string;
    /**
     * File size in bytes. Non-null if file upload status is "COMPLETE".
     */
    size: number | null;
    /**
     * MIME type of the file's content
     */
    contentType: string;
    /**
     * The tags of the file as an object of key/value pairs
     */
    tags: {
      [k: string]: string;
    };
    /**
     * Metadata of the file as an object of key/value pairs. The values can be of any type.
     */
    metadata: {
      [k: string]: any;
    };
    /**
     * File creation timestamp in ISO 8601 format
     */
    createdAt: string;
    /**
     * File last update timestamp in ISO 8601 format
     */
    updatedAt: string;
    /**
     * Access policies configured for the file.
     */
    accessPolicies: ("integrations" | "public_content")[];
    /**
     * Whether the file was requested to be indexed for search or not.
     */
    index: boolean;
    /**
     * Status of the file. If the status is `upload_pending`, the file content has not been uploaded yet. The status will be set to `upload_completed` once the file content has been uploaded successfully.
     *
     * If the upload failed for any reason (e.g. exceeding the storage quota or the maximum file size limit) the status will be set to `upload_failed` and the reason for the failure will be available in the `failedStatusReason` field of the file.
     *
     * However, if the file has been uploaded and the `index` attribute was set to `true` on the file, the status will immediately transition to the `indexing_pending` status (the `upload_completed` status step will be skipped).
     *
     * Once the indexing is completed and the file is ready to be used for searching its status will be set to `indexing_completed`. If the indexing failed the status will be set to `indexing_failed` and the reason for the failure will be available in the `failedStatusReason` field.
     */
    status:
      | "upload_pending"
      | "upload_failed"
      | "upload_completed"
      | "indexing_pending"
      | "indexing_failed"
      | "indexing_completed";
    /**
     * If the file status is `upload_failed` or `indexing_failed` this will contain the reason of the failure.
     */
    failedStatusReason?: string;
    /**
     * File expiry timestamp in ISO 8601 format
     */
    expiresAt?: string;
    owner: {
      type: "bot" | "integration" | "user";
      /**
       * This field is present if `type` is "user" or "bot". If `type` is "user", this is the user ID. If `type` is "bot", this is the bot ID.
       */
      id?: string;
      /**
       * This field is present if the `type` is "integration". If `type` is "integration", this is the integration name.
       */
      name?: string;
      /**
       * This field is present if the `type` is "integration". If `type` is "integration", this is the integration instance alias.
       */
      alias?: string;
    };
    /**
     * Indicates the indexing stack used to index this file. Present only when file has been successfully indexed. A value of "v2" denotes the latest stack, "v1" denotes the legacy stack.
     */
    indexingStack?: "v1" | "v2";
  };
}

