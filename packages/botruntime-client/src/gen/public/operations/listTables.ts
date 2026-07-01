// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListTablesRequestHeaders {}

export interface ListTablesRequestQuery {
  tags?: {
    [k: string]: string;
  };
}

export interface ListTablesRequestParams {}

export interface ListTablesRequestBody {}

export type ListTablesInput = ListTablesRequestBody & ListTablesRequestHeaders & ListTablesRequestQuery & ListTablesRequestParams

export type ListTablesRequest = {
  headers: ListTablesRequestHeaders;
  query: ListTablesRequestQuery;
  params: ListTablesRequestParams;
  body: ListTablesRequestBody;
}

export const parseReq = (input: ListTablesInput): ListTablesRequest & { path: string } => {
  return {
    path: `/v1/tables`,
    headers: {  },
    query: { 'tags': input['tags'] },
    params: {  },
    body: {  },
  }
}

export interface ListTablesResponse {
  tables: {
    /**
     * Unique identifier for the table
     */
    id: string;
    /**
     * Required. This name is used to identify your table.
     */
    name: string;
    /**
     * The 'factor' multiplies the row's data storage limit by 4KB and its quota count. It can only be increased (not decreased) after table creation via updateTable. For instance, a factor of 2 increases storage to 8KB but counts as 2 rows in your quota. The default factor is 1.
     */
    factor?: number;
    /**
     * A table designated as "frozen" is immutable in terms of its name and schema structure; modifications to its schema or a renaming operation are not permitted. The only action that can be taken on such a table is deletion. The schema established at the time of creation is locked in as the final structure. To implement any changes, the table must be duplicated with the desired alterations.
     */
    frozen?: boolean;
    /**
     * Designate a column as the primary unique identifier for this table. When set, a unique index is automatically created on this column, enabling significantly faster upsert operations. All values in this column must be unique across the table. When set to null, the key index is removed.
     */
    keyColumn?: string | null;
    schema: {
      $schema?: string;
      /**
       * List of keys/columns in the table.
       */
      properties: {
        [k: string]: {
          type: "string" | "number" | "boolean" | "object" | "array" | "null";
          format?: "date-time";
          description?: string;
          /**
           * String properties must match this pattern
           */
          pattern?: string;
          /**
           * String properties must be one of these values
           */
          enum?: string[];
          /**
           * Defines the shape of items in an array
           */
          items?: {
            type: "string" | "number" | "boolean" | "object" | "array" | "null";
            [k: string]: any;
          };
          nullable?: boolean;
          properties?: {
            [k: string]: {
              type: "string" | "number" | "boolean" | "object" | "array" | "null";
              [k: string]: any;
            };
          };
          "x-zui": {
            index: number;
            /**
             * [deprecated] ID of the column.
             */
            id?: string;
            /**
             * Indicates if the column is vectorized and searchable.
             */
            searchable?: boolean;
            /**
             * Indicates if the field is hidden in the UI
             */
            hidden?: boolean;
            /**
             * Order of the column in the UI
             */
            order?: number;
            /**
             * Width of the column in the UI
             */
            width?: number;
            /**
             * ID of the schema
             */
            schemaId?: string;
            computed?: {
              action: "ai" | "code" | "workflow";
              dependencies?: string[];
              /**
               * Prompt when action is "ai"
               */
              prompt?: string;
              /**
               * Code to execute when action is "code"
               */
              code?: string;
              /**
               * Model to use when action is "ai"
               */
              model?: string;
              /**
               * ID of Workflow to execute when action is "workflow"
               */
              workflowId?: string;
              enabled?: boolean;
            };
            /**
             * TypeScript typings for the column. Recommended if the type is "object", ex: "\{ foo: string; bar: number \}"
             */
            typings?: string;
          };
        };
      };
      /**
       * Additional properties can be provided, but they will be ignored if no column matches.
       */
      additionalProperties: true;
      /**
       * Array of required properties.
       */
      required?: string[];
      type: "object";
    };
    /**
     * Optional tags to help organize your tables. These should be passed here as an object representing key/value pairs.
     */
    tags?: {
      [k: string]: string;
    };
    /**
     * Indicates if the table is enabled for computation.
     */
    isComputeEnabled?: boolean;
    /**
     * Timestamp of table creation.
     */
    createdAt?: string;
    /**
     * Timestamp of the last table update.
     */
    updatedAt?: string;
  }[];
}

