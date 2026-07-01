export const Knowledge = {} as const

export const WellKnownTags = {
  knowledge: {
    /**
     * All knowledge base have this tag (with value "knowledge-base") to identify them as knowledge-related records.
     * @example "source": "knowledge-base"
     */
    KNOWLEDGE: 'source',

    /**
     * The ID of the knowledge base the record belongs to.
     * This is the ID of the Knowledge Base primitive from Botpress.
     * @example "kbId": "kb_01K6RT9T39KF7K0A7R7D71TDZ1"
     */
    KNOWLEDGE_BASE_ID: 'kbId',

    /**
     * The name of the knowledge base as defined in the Knowledge Base primitive by the user.
     * @example "kbName": "My Files"
     */
    KNOWLEDGE_BASE_NAME: 'kbName',

    /**
     * The ID of the Data Source the record was ingested from.
     * @example "dsId": "docs"
     */
    KNOWLEDGE_SOURCE_ID: 'dsId',

    /**
     * The type of the Data Source the record was ingested from.
     * Possible values are: "document", "rich-text", "web-page", etc.
     * @example "dsType": "document"
     */
    KNOWLEDGE_SOURCE_TYPE: 'dsType',
  },
} as const

export const WellKnownMetadata = {
  knowledge: {
    /**
     * The title of the document or page.
     * @example "title": "Getting Started Guide"
     */
    TITLE: 'title',

    /**
     * The URL of the document or page.
     * @example "url": "https://example.com/docs/getting-started"
     */
    URL: 'url',

    /**
     * The favicon URL of the website.
     * @example "favicon": "https://example.com/favicon.ico"
     */
    FAVICON: 'favicon',

    /**
     * A brief description of the document or page.
     * @example "description": "Learn how to get started with our platform"
     */
    DESCRIPTION: 'description',
  },
} as const
