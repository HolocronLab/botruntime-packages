// this file was automatically generated, do not edit
/* eslint-disable */

export interface GetDereferencedPublicPluginByIdRequestHeaders {}

export interface GetDereferencedPublicPluginByIdRequestQuery {
  /**
   * Mapping of interface aliases to integration IDs
   */
  interfaces: {
    /**
     * integration id
     */
    [k: string]: string;
  };
}

export interface GetDereferencedPublicPluginByIdRequestParams {
  id: string;
}

export interface GetDereferencedPublicPluginByIdRequestBody {}

export type GetDereferencedPublicPluginByIdInput = GetDereferencedPublicPluginByIdRequestBody & GetDereferencedPublicPluginByIdRequestHeaders & GetDereferencedPublicPluginByIdRequestQuery & GetDereferencedPublicPluginByIdRequestParams

export type GetDereferencedPublicPluginByIdRequest = {
  headers: GetDereferencedPublicPluginByIdRequestHeaders;
  query: GetDereferencedPublicPluginByIdRequestQuery;
  params: GetDereferencedPublicPluginByIdRequestParams;
  body: GetDereferencedPublicPluginByIdRequestBody;
}

export const parseReq = (input: GetDereferencedPublicPluginByIdInput): GetDereferencedPublicPluginByIdRequest & { path: string } => {
  return {
    path: `/v1/admin/hub/plugins/${encodeURIComponent(input['id'])}/dereferenced`,
    headers: {  },
    query: { 'interfaces': input['interfaces'] },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface GetDereferencedPublicPluginByIdResponse {
  plugin: {
    /**
     * ID of the [Plugin](#schema_plugin)
     */
    id: string;
    /**
     * Name of the [Plugin](#schema_plugin)
     */
    name: string;
    /**
     * Version of the [Plugin](#schema_plugin)
     */
    version: string;
    /**
     * Creation date of the [Plugin](#schema_plugin) in ISO 8601 format
     */
    createdAt: string;
    /**
     * Updating date of the [Plugin](#schema_plugin) in ISO 8601 format
     */
    updatedAt: string;
    /**
     * Configuration definition
     */
    configuration: {
      /**
       * Title of the configuration
       */
      title?: string;
      /**
       * Description of the configuration
       */
      description?: string;
      /**
       * Schema of the configuration in the `JSON schema` format. The configuration data is validated against this `JSON schema`.
       */
      schema: {
        [k: string]: any;
      };
    };
    states: {
      [k: string]: {
        /**
         * Type of the [State](#schema_state) (`conversation`, `user` or `bot`)
         */
        type: "conversation" | "user" | "bot";
        /**
         * Schema of the [State](#schema_state) in the `JSON schema` format. This `JSON schema` is going to be used for validating the state data.
         */
        schema: {
          [k: string]: any;
        };
        /**
         * Expiry of the [State](#schema_state) in milliseconds. The state will expire if it is idle for the configured value. By default, a state doesn't expire.
         */
        expiry?: number;
      };
    };
    events: {
      /**
       * Event Definition
       */
      [k: string]: {
        /**
         * Title of the event
         */
        title?: string;
        /**
         * Description of the event
         */
        description?: string;
        schema: {
          [k: string]: any;
        };
        /**
         * Optional attributes
         */
        attributes?: {
          [k: string]: string;
        };
      };
    };
    actions: {
      /**
       * Action definition
       */
      [k: string]: {
        /**
         * Title of the action
         */
        title?: string;
        /**
         * Description of the action
         */
        description?: string;
        billable?: boolean;
        cacheable?: boolean;
        input: {
          schema: {
            [k: string]: any;
          };
        };
        output: {
          schema: {
            [k: string]: any;
          };
        };
        /**
         * Optional attributes
         */
        attributes?: {
          [k: string]: string;
        };
      };
    };
    dependencies: {
      interfaces: {
        [k: string]: {
          id: string;
          name: string;
          version: string;
        };
      };
      integrations: {
        [k: string]: {
          id: string;
          name: string;
          version: string;
        };
      };
    };
    /**
     * User object configuration
     */
    user: {
      tags: {
        /**
         * Definition of a tag that can be provided on the object
         */
        [k: string]: {
          /**
           * Title of the tag
           */
          title?: string;
          /**
           * Description of the tag
           */
          description?: string;
        };
      };
    };
    /**
     * Conversation object configuration
     */
    conversation: {
      tags: {
        /**
         * Definition of a tag that can be provided on the object
         */
        [k: string]: {
          /**
           * Title of the tag
           */
          title?: string;
          /**
           * Description of the tag
           */
          description?: string;
        };
      };
    };
    /**
     * Message object configuration
     */
    message: {
      tags: {
        /**
         * Definition of a tag that can be provided on the object
         */
        [k: string]: {
          /**
           * Title of the tag
           */
          title?: string;
          /**
           * Description of the tag
           */
          description?: string;
        };
      };
    };
    /**
     * Title of the plugin. This is the name that will be displayed in the UI
     */
    title: string;
    /**
     * Description of the plugin. This is the description that will be displayed in the UI
     */
    description: string;
    /**
     * URL of the icon of the plugin. This is the icon that will be displayed in the UI
     */
    iconUrl: string;
    /**
     * URL of the readme of the plugin. This is the readme that will be displayed in the UI
     */
    readmeUrl: string;
    /**
     * @deprecated
     * [DEPRECATED] Indicates if the plugin is public. Please use the "visibility" parameter instead.
     */
    public: boolean;
    /**
     * The plugin's visibility. Public plugins are available to all and cannot be updated without creating a new version. Unlisted plugins behave identically to public plugins, but they are not listed in the plugin hub. By default, plugins are private and only accessible to the workspace that created them.
     */
    visibility: "public" | "private" | "unlisted";
    /**
     * The lifecycle status of the plugin. When a plugin is deprecated, it can no longer be installed.
     */
    lifecycleStatus: "published" | "deprecated";
    /**
     * Optional key-value attributes from the plugin definition
     */
    attributes?: {
      [k: string]: string;
    };
  };
}

