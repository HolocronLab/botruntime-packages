// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpsertFileRequestHeaders {}

export interface UpsertFileRequestQuery {}

export interface UpsertFileRequestParams {}

export interface UpsertFileRequestBody {
  /**
   * Unique key for the file. Must be unique across the bot (and the integration, when applicable).
   */
  key: string;
  /**
   * File tags as an object of key-value pairs. Tag values should be of `string` (text) type.
   */
  tags?: {
    [k: string]: string;
  };
  /**
   * File size in bytes. This will count against your File Storage quota. If the `index` parameter is set to `true`, this will also count against your Vector DB Storage quota.
   */
  size: number;
  /**
   * Set to a value of 'true' to index the file in vector storage. Only certain file formats are currently supported for indexing. Files larger than 95 MB cannot be indexed. Note that if a file is indexed, it will count towards both the Vector DB Storage quota and the File Storage quota of the workspace.
   */
  index?: boolean;
  indexing?: {
    /**
     * Configuration to use for indexing the file, will be stored in the file's metadata for reference.
     */
    configuration: {
      parsing?: {
        /**
         * The parsing mode to index the file. Using `agent` will use agentic document processing to parse the file and will incurr in AI Spend cost, while `standard` will use a faster but less accurate parser that will not incur in AI Spend cost.
         */
        mode?: "agent" | "standard";
        /**
         * The minimum length a standalone paragraph should have. If a paragraph is shorter than this, it will be merged with the next immediate paragraph.
         */
        minimumParagraphLength?: number;
        /**
         * (Team/Enterprise plan only, charged as AI Spend) Enabling this will use a lightweight/inexpensive LLM to clean up the extracted content of PDF files before indexing them to increase the quality of the stored vectors, as PDFs often store raw text in unusual ways which when extracted may result in formatting issues (e.g. broken sentences/paragraphs, unexpected headings, garbled characters, etc.) that can affect retrieval performance for certain user queries if left untouched.
         *
         * Notes:
         * - This feature is only available in Team and Enterprise plans.
         * - This feature is only available for PDF files. If the file isn't a PDF, this setting will be ignored and no AI Spend will be incurred.
         * - We recommend using this feature for PDFs that have custom layouts or design. For simple text-based PDFs like documents and books, this feature is usually not necessary.
         * - The smart cleanup takes some time to perform due to the LLM calls involved, so enabling it will increase the total time it takes to index the file.
         * - We take steps to prevent the original text from being fundamentally changed but due to the nature of LLMs this could theoretically still happen so it's recommended to review the passages generated for the file after indexing to ensure the content is still accurate.
         * - This feature is limited to the first 30 pages or 20 KB of text in the PDF file (whichever comes first). If the file has more content than these limits then the rest of the file will be indexed as-is without any cleanup. If you need to clean up the content of the entire file, consider splitting it into smaller files.
         */
        smartCleanup?: boolean;
      };
      chunking?: {
        /**
         * The maximum length of a chunk in characters.
         */
        maximumChunkLength?: number;
        /**
         * The number of surrounding context levels to include in the vector embedding of the chunk.
         */
        embeddedContextLevels?: number;
        /**
         * Include the breadcrumb of the chunk in the vector embedding.
         */
        embedBreadcrumb?: boolean;
      };
      summarization?: {
        /**
         * (Team/Enterprise plan only, charged as AI Spend) Create summaries for this file and index them as standalone vectors. Enabling this option will incur in AI Spend cost (charged to the workspace of the bot) to generate the summaries based on the amount of content in the file and the summarization model used.
         *
         * Please note that this feature is only available in Team and Enterprise plans.
         */
        enable?: boolean;
        /**
         * The model type to use for summarization.
         */
        modelType?: "inexpensive" | "balanced" | "accurate";
        /**
         * The minimum length a section of the file should have to create a summary of it.
         */
        minimumInputLength?: number;
        /**
         * The maximum length of a summary (in tokens).
         */
        outputTokenLimit?: number;
        /**
         * Generate a summary of the entire file and index it as a standalone vector.
         */
        generateMasterSummary?: boolean;
      };
      /**
       * If not set, the default indexing stack will be used.
       */
      stack?: "legacy" | "realtime-v1";
      vision?: {
        /**
         * (Team/Enterprise plan only, charged as AI Spend) For PDF files, set this option to `true` or pass an array with specific page numbers to use a vision-enabled LLM to transcribe each page of the PDF as standalone vectors and index them.
         *
         * This feature is useful when a PDF file contains custom designs or layouts, or when your document has many infographics, which require visual processing in order to index the file effectively, as the default text-based indexing may not be enough to allow your bot to correctly understand the content in your PDFs.
         *
         * Notes:
         * - This feature is only available in Team and Enterprise plans.
         * - Enabling this feature will incur in AI Spend cost to use a vision-enabled LLM to index the PDF pages.
         * - This is limited to a maximum of 100 pages of the PDF. If the file has more pages then the rest of the pages will NOT be transcribed using this vision feature, and will be processed using the default text-based indexing instead. If you need to transcribe the entire file using vision, please split it into smaller files.
         * - Pages that are vision-transcribed will not be processed by the default text-based indexing to avoid duplicate content in the index.
         * - This feature is only available for PDF files. If the file isn't a PDF, this setting will be ignored and no AI Spend will be incurred.
         */
        transcribePages?: {
          [k: string]: any;
        };
        /**
         * (Team/Enterprise plan only, charged as AI Spend) For PDF files, set this option to `true` or pass an array with specific page numbers to use a vision-enabled LLM to index each page of the PDF as a standalone image.
         *
         * Enabling this feature will allow Autonomous Nodes in your bot to answer visual or higher-level questions about the content in these pages that can usually not be answered correctly by the default text-based indexing or visual transcription.
         *
         * This feature is useful when a PDF has:
         * - Tables with complex layouts
         * - Charts, diagrams or infographics
         * - Photos or images that can be used to answer user queries
         *
         * Notes:
         * - This feature is only available in Team and Enterprise plans.
         * - Enabling this will incur in extra AI Spend cost and additional File Storage usage, in order to use a vision-enabled LLM to visually index the PDF pages and store them as standalone page images in the bot's file storage.
         * - Enabling this may increase the overall AI Spend cost of your bot as your bot may pass one or more indexed page images to a vision-enabled LLM for answering user queries.
         * - This is limited to the first 100 pages of the PDF. If the file has more pages then the rest of the pages will NOT be vision-indexed. If you need to visually index the entire file, please split it into smaller files.
         * - This feature is only available for PDF files. If the file isn't a PDF, this setting will be ignored and no AI Spend will be incurred.
         */
        indexPages?: {
          [k: string]: any;
        };
      };
    };
  };
  /**
   * File access policies. Add "public_content" to allow public access to the file content. Add "integrations" to allow read, search and list operations for any integration installed in the bot.
   */
  accessPolicies?: ("public_content" | "integrations")[];
  /**
   * File content type. If omitted, the content type will be inferred from the file extension (if any) specified in `key`. If a content type cannot be inferred, the default is "application/octet-stream".
   */
  contentType?: string;
  /**
   * Expiry timestamp in ISO 8601 format with UTC timezone. After expiry, the File will be deleted. Must be in the future. Cannot be more than 90 days from now. The value up to minutes is considered. Seconds and milliseconds are ignored.
   */
  expiresAt?: string;
  /**
   * Use when your file has "public_content" in its access policy and you need the file\'s content to be immediately accessible through its URL after the file has been uploaded without having to wait for the upload to be processed by our system.
   *
   * If set to `true`, the `x-amz-tagging` HTTP header with a value of `public=true` will need to be sent in the HTTP PUT request to the `uploadUrl` in order for the upload request to work.
   */
  publicContentImmediatelyAccessible?: boolean;
  /**
   * Custom metadata for the file expressed as an object of key-value pairs. The values can be of any type.
   */
  metadata?: {
    [k: string]: any;
  };
}

export type UpsertFileInput = UpsertFileRequestBody & UpsertFileRequestHeaders & UpsertFileRequestQuery & UpsertFileRequestParams

export type UpsertFileRequest = {
  headers: UpsertFileRequestHeaders;
  query: UpsertFileRequestQuery;
  params: UpsertFileRequestParams;
  body: UpsertFileRequestBody;
}

export const parseReq = (input: UpsertFileInput): UpsertFileRequest & { path: string } => {
  return {
    path: `/v1/files`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'key': input['key'], 'tags': input['tags'], 'size': input['size'], 'index': input['index'], 'indexing': input['indexing'], 'accessPolicies': input['accessPolicies'], 'contentType': input['contentType'], 'expiresAt': input['expiresAt'], 'publicContentImmediatelyAccessible': input['publicContentImmediatelyAccessible'], 'metadata': input['metadata'] },
  }
}

export interface UpsertFileResponse {
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
    /**
     * URL to upload the file content. File content needs to be sent to this URL via a PUT request.
     */
    uploadUrl: string;
  };
}

