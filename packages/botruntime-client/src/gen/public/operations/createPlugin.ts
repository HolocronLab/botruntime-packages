// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreatePluginRequestHeaders {}

export interface CreatePluginRequestQuery {}

export interface CreatePluginRequestParams {}

export interface CreatePluginRequestBody {
  /**
   * Name of the [Plugin](#schema_plugin)
   */
  name: string;
  /**
   * Version of the [Plugin](#schema_plugin)
   */
  version: string;
  /**
   * Configuration definition
   */
  configuration?: {
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
  states?: {
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
  events?: {
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
  actions?: {
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
  /**
   * User object configuration
   */
  user?: {
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
  conversation?: {
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
  message?: {
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
  sdkVersion?: string;
  code: {
    /**
     * Code of plugin bundled for Node.JS
     */
    node: string;
    /**
     * Code of plugin bundled for the browser
     */
    browser: string;
  };
  /**
   * Base64 encoded svg of the plugin icon. This icon is global to the plugin each versions will be updated when this changes.
   */
  icon?: string;
  /**
   * Base64 encoded markdown of the plugin readme. The readme is specific to each plugin versions.
   */
  readme?: string;
  /**
   * Title of the plugin. This is the name that will be displayed in the UI
   */
  title?: string;
  /**
   * Description of the plugin. This is the description that will be displayed in the UI
   */
  description?: string;
  /**
   * @deprecated
   * [DEPRECATED] Indicates if the plugin is public. Please use the "visibility" parameter instead.
   */
  public?: boolean;
  /**
   * The plugin's visibility. Public plugins are available to all and cannot be updated without creating a new version. Unlisted plugins behave identically to public plugins, but they are not listed in the plugin hub. By default, plugins are private and only accessible to the workspace that created them.
   */
  visibility?: "public" | "private" | "unlisted";
  dependencies?: {
    /**
     * Mapping of interface aliases to interface references
     */
    interfaces?: {
      [k: string]: {
        /**
         * Id of the interface. If provided, "name" and "version" are ignored
         */
        id?: string;
        /**
         * Name of the interface
         */
        name?: string;
        /**
         * Version of the interface. Accepts semver versions and version ranges
         */
        version?: string;
      };
    };
    /**
     * Mapping of integration aliases to integration references
     */
    integrations?: {
      [k: string]: {
        /**
         * Id of the integration. If provided, "name" and "version" are ignored
         */
        id?: string;
        /**
         * Name of the integration
         */
        name?: string;
        /**
         * Version of the integration. Accepts semver versions and version ranges
         */
        version?: string;
      };
    };
  };
  /**
   * Optional key-value attributes from the plugin definition
   */
  attributes?: {
    [k: string]: string;
  };
}

export type CreatePluginInput = CreatePluginRequestBody & CreatePluginRequestHeaders & CreatePluginRequestQuery & CreatePluginRequestParams

export type CreatePluginRequest = {
  headers: CreatePluginRequestHeaders;
  query: CreatePluginRequestQuery;
  params: CreatePluginRequestParams;
  body: CreatePluginRequestBody;
}

export const parseReq = (input: CreatePluginInput): CreatePluginRequest & { path: string } => {
  return {
    path: `/v1/admin/plugins`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'name': input['name'], 'version': input['version'], 'configuration': input['configuration'], 'states': input['states'], 'events': input['events'], 'actions': input['actions'], 'user': input['user'], 'conversation': input['conversation'], 'message': input['message'], 'sdkVersion': input['sdkVersion'], 'code': input['code'], 'icon': input['icon'], 'readme': input['readme'], 'title': input['title'], 'description': input['description'], 'public': input['public'], 'visibility': input['visibility'], 'dependencies': input['dependencies'], 'attributes': input['attributes'] },
  }
}

export interface CreatePluginResponse {
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

