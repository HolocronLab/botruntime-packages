// this file was automatically generated, do not edit
/* eslint-disable */

export interface Bot {
  /**
   * Id of the [Bot](#schema_bot)
   */
  id: string;
  /**
   * Creation date of the [Bot](#schema_bot) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Updating date of the [Bot](#schema_bot) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Signing secret of the [Bot](#schema_bot). This field is only visible when creating a new bot or when rotating the signing secret of an existing bot.
   */
  signingSecret: string;
  /**
   * A mapping of integrations to their configuration. If the `x-multiple-integrations` header is present, this object is keyed by integration aliases. Otherwise, this object is keyed by integration ids.
   */
  integrations: {
    [k: string]: {
      enabled: boolean;
      /**
       * Name of the [Integration](#schema_integration)
       */
      name: string;
      /**
       * Version of the [Integration](#schema_integration)
       */
      version: string;
      webhookUrl: string;
      webhookId: string;
      identifier?: string;
      configurationType: string | null;
      configuration: {
        [k: string]: any;
      };
      status:
        | "registration_pending"
        | "registered"
        | "registration_failed"
        | "unregistration_pending"
        | "unregistered"
        | "unregistration_failed";
      statusReason: string | null;
      /**
       * Disabled channels for this integration
       */
      disabledChannels: string[];
      /**
       * ID of the [Integration](#schema_integration)
       */
      id: string;
      /**
       * Creation date of the [Integration](#schema_integration) in ISO 8601 format
       */
      createdAt: string;
      /**
       * Updating date of the [Integration](#schema_integration) in ISO 8601 format
       */
      updatedAt: string;
      /**
       * Title of the integration. This is the name that will be displayed in the UI
       */
      title: string;
      /**
       * Description of the integration. This is the description that will be displayed in the UI
       */
      description: string;
      /**
       * URL of the icon of the integration. This is the icon that will be displayed in the UI
       */
      iconUrl: string;
      /**
       * @deprecated
       * [DEPRECATED] Indicates whether the integration is public. Please use the "visibility" parameter instead.
       */
      public: boolean;
      /**
       * The integration's visibility. Public integrations are available to all and cannot be updated without creating a new version. Unlisted integrations behave identically to public integrations, but they are not listed in the integration hub. By default, integrations are private and only accessible to the workspace that created them.
       */
      visibility: "public" | "private" | "unlisted";
      /**
       * Status of the integration version verification
       */
      verificationStatus: "unapproved" | "pending" | "approved" | "rejected";
      /**
       * The lifecycle status of the integration. When an integration is deprecated, it can no longer be installed.
       */
      lifecycleStatus: "published" | "deprecated";
    };
  };
  /**
   * A mapping of plugin aliases to their configuration
   */
  plugins: {
    [k: string]: {
      enabled: boolean;
      /**
       * Name of the [Plugin](#schema_plugin)
       */
      name: string;
      /**
       * Version of the [Plugin](#schema_plugin)
       */
      version: string;
      configuration: {
        [k: string]: any;
      };
      /**
       * A mapping of plugin interface aliases to their backing integrations
       */
      interfaces?: {
        [k: string]: {
          integrationId: string;
          integrationAlias: string;
          integrationInterfaceAlias?: string;
          interfaceId: string;
        };
      };
      /**
       * A mapping of plugin integration aliases to their backing integrations
       */
      integrations?: {
        [k: string]: {
          integrationId: string;
          integrationAlias: string;
        };
      };
      /**
       * ID of the [Plugin](#schema_plugin)
       */
      id: string;
      /**
       * Creation date of the [Plugin](#schema_plugin) in ISO 8601 format
       */
      createdAt: string;
      /**
       * Updating date of the [Plugin](#schema_plugin) in ISO 8601 format
       */
      updatedAt: string;
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
    };
  };
  /**
   * Maximum execution time of the bot (in seconds).
   */
  maxExecutionTime?: number;
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
   * A mapping of states to their definition
   */
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
  /**
   * Configuration of the bot
   */
  configuration: {
    /**
     * Configuration data
     */
    data: {
      [k: string]: any;
    };
    /**
     * Schema of the configuration in the `JSON schema` format. The configuration data is validated against this `JSON schema`.
     */
    schema: {
      [k: string]: any;
    };
  };
  /**
   * Events definition
   */
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
  /**
   * Recurring events
   */
  recurringEvents: {
    [k: string]: {
      schedule: {
        cron: string;
      };
      type: string;
      payload: {
        [k: string]: any;
      };
      /**
       * The number of times the recurring event failed to run. This counter resets once the recurring event runs successfully.
       */
      failedAttempts: number;
      /**
       * The reason why the recurring event failed to run in the last attempt.
       */
      lastFailureReason: string | null;
    };
  };
  /**
   * Subscriptions of the bot
   */
  subscriptions: {
    /**
     * Events that the bot is currently subscribed on (ex: "slack:reactionAdded"). If null, the bot is subscribed to all events.
     */
    events: {
      [k: string]: {};
    } | null;
  };
  /**
   * Actions definition
   */
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
  /**
   * Tags of [Bot](#schema_bot)
   */
  tags: {
    [k: string]: string;
  };
  /**
   * Name of the [Bot](#schema_bot)
   */
  name: string;
  /**
   * Description of the [Bot](#schema_bot)
   */
  description?: string;
  /**
   * Last deployment date of the [Bot](#schema_bot) in the ISO 8601 format
   */
  deployedAt?: string;
  /**
   * Indicates if the [Bot](#schema_bot) is a development bot; Development bots run locally and can install dev integrations
   */
  dev: boolean;
  /**
   * List of secret names configured for this [Bot](#schema_bot)
   */
  secrets: string[];
  /**
   * Id of the user that created the bot
   */
  createdBy?: string;
  /**
   * Indicates if the [Bot](#schema_bot) should be in always alive mode
   */
  alwaysAlive: boolean;
  /**
   * Status of the bot
   */
  status: "active" | "deploying" | "deleting";
  /**
   * Media files associated with the [Bot](#schema_bot)
   */
  medias: {
    /**
     * URL of the media file
     */
    url: string;
    /**
     * Name of the media file
     */
    name: string;
  }[];
  /**
   * Type of the [Bot](#schema_bot)
   */
  type: "studio" | "adk" | "desk";
}

export interface Integration {
  /**
   * ID of the [Integration](#schema_integration)
   */
  id: string;
  /**
   * Creation date of the [Integration](#schema_integration) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Updating date of the [Integration](#schema_integration) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Global identifier configuration of the [Integration](#schema_integration)
   */
  identifier: {
    /**
     * VRL Script of the [Integration](#schema_integration) to handle incoming requests for a request that doesn't have an identifier
     */
    fallbackHandlerScript?: string;
    /**
     * VRL Script of the [Integration](#schema_integration) to extract the identifier from an incoming webhook often use for OAuth
     */
    extractScript?: string;
  };
  sandbox?: {
    /**
     * VRL Script of the [Integration](#schema_integration) to extract the identifier from an incoming webhook used specifically for the sandbox
     */
    identifierExtractScript?: string;
    /**
     * VRL Script of the [Integration](#schema_integration) to extract the message from an incoming webhook used specifically for the sandbox
     */
    messageExtractScript?: string;
  };
  /**
   * Maximum execution time of the integration (in seconds).
   */
  maxExecutionTime?: number;
  /**
   * URL of the [Integration](#schema_integration)
   */
  url: string;
  /**
   * Signing secret of the [Integration](#schema_integration). This field is only visible when creating a new integration or when rotating the signing secret of an existing integration.
   */
  signingSecret: string;
  /**
   * Name of the [Integration](#schema_integration)
   */
  name: string;
  /**
   * Version of the [Integration](#schema_integration)
   */
  version: string;
  interfaces: {
    [k: string]: {
      /**
       * ID of the interface
       */
      id: string;
      /**
       * Name of the interface
       */
      name: string;
      /**
       * Version of the interface
       */
      version: string;
      entities: {
        [k: string]: {
          name: string;
        };
      };
      actions: {
        [k: string]: {
          name: string;
        };
      };
      events: {
        [k: string]: {
          name: string;
        };
      };
      channels: {
        [k: string]: {
          name: string;
        };
      };
    };
  };
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
     * Identifier configuration of the [Integration](#schema_integration)
     */
    identifier: {
      linkTemplateScript?: string;
      required: boolean;
    };
    /**
     * Schema of the configuration in the `JSON schema` format. The configuration data is validated against this `JSON schema`.
     */
    schema: {
      [k: string]: any;
    };
  };
  configurations: {
    /**
     * Configuration definition
     */
    [k: string]: {
      /**
       * Title of the configuration
       */
      title?: string;
      /**
       * Description of the configuration
       */
      description?: string;
      /**
       * Identifier configuration of the [Integration](#schema_integration)
       */
      identifier: {
        linkTemplateScript?: string;
        required: boolean;
      };
      /**
       * Schema of the configuration in the `JSON schema` format. The configuration data is validated against this `JSON schema`.
       */
      schema: {
        [k: string]: any;
      };
    };
  };
  channels: {
    /**
     * Channel definition
     */
    [k: string]: {
      /**
       * Title of the channel
       */
      title?: string;
      /**
       * Description of the channel
       */
      description?: string;
      messages: {
        /**
         * Message definition
         */
        [k: string]: {
          schema: {
            [k: string]: any;
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
        /**
         * The conversation creation setting determines how to create a conversation through the API directly. The integration will have to implement the `createConversation` functionality to support this setting.
         */
        creation: {
          /**
           * Enable conversation creation
           */
          enabled: boolean;
          /**
           * The list of tags that are required to be specified when calling the API directly to create a conversation.
           */
          requiredTags: string[];
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
    };
  };
  states: {
    /**
     * State definition
     */
    [k: string]: {
      /**
       * Type of the [State](#schema_state) (`conversation`, `user` or `integration`)
       */
      type: "conversation" | "user" | "integration";
      /**
       * Schema of the [State](#schema_state) in the `JSON schema` format. This `JSON schema` is going to be used for validating the state data.
       */
      schema: {
        [k: string]: any;
      };
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
    /**
     * The user creation setting determines how to create a user through the API directly. The integration will have to implement the `createUser` functionality to support this setting.
     */
    creation: {
      /**
       * Enable user creation
       */
      enabled: boolean;
      /**
       * The list of tags that are required to be specified when calling the API directly to create a user.
       */
      requiredTags: string[];
    };
  };
  entities: {
    /**
     * Entity definition
     */
    [k: string]: {
      /**
       * Title of the entity
       */
      title?: string;
      /**
       * Description of the entity
       */
      description?: string;
      schema: {
        [k: string]: any;
      };
    };
  };
  /**
   * Indicates if the integration is a development integration; Dev integrations run locally
   */
  dev: boolean;
  /**
   * Title of the integration. This is the name that will be displayed in the UI
   */
  title: string;
  /**
   * Description of the integration. This is the description that will be displayed in the UI
   */
  description: string;
  /**
   * URL of the icon of the integration. This is the icon that will be displayed in the UI
   */
  iconUrl: string;
  /**
   * URL of the readme of the integration. This is the readme that will be displayed in the UI
   */
  readmeUrl: string;
  /**
   * @deprecated
   * [DEPRECATED] Indicates whether the integration is public. Please use the "visibility" parameter instead.
   */
  public: boolean;
  /**
   * The integration's visibility. Public integrations are available to all and cannot be updated without creating a new version. Unlisted integrations behave identically to public integrations, but they are not listed in the integration hub. By default, integrations are private and only accessible to the workspace that created them.
   */
  visibility: "public" | "private" | "unlisted";
  /**
   * Status of the integration version verification
   */
  verificationStatus: "unapproved" | "pending" | "approved" | "rejected";
  /**
   * The lifecycle status of the integration. When an integration is deprecated, it can no longer be installed.
   */
  lifecycleStatus: "published" | "deprecated";
  /**
   * Secrets are integration-wide values available in the code via environment variables formatted with a SECRET_ prefix followed by your secret name. A secret name must respect SCREAMING_SNAKE casing.
   */
  secrets: string[];
  /**
   * Optional key-value attributes from the integration definition
   */
  attributes?: {
    [k: string]: string;
  };
}

export interface Interface {
  /**
   * ID of the [Interface](#schema_interface)
   */
  id: string;
  /**
   * Creation date of the [Interface](#schema_interface) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Updating date of the [Interface](#schema_interface) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Name of the [Interface](#schema_interface)
   */
  name: string;
  /**
   * Version of the [Interface](#schema_interface)
   */
  version: string;
  entities: {
    /**
     * Entity definition
     */
    [k: string]: {
      /**
       * Title of the entity
       */
      title?: string;
      /**
       * Description of the entity
       */
      description?: string;
      schema: {
        [k: string]: any;
      };
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
  channels: {
    [k: string]: {
      /**
       * Title of the channel
       */
      title?: string;
      /**
       * Description of the channel
       */
      description?: string;
      messages: {
        /**
         * Message definition
         */
        [k: string]: {
          schema: {
            [k: string]: any;
          };
        };
      };
    };
  };
  /**
   * Template string optionaly used at build time by integrations implementing this interface to pick a name for actions and events.
   */
  nameTemplate?: {
    script: string;
    language: string;
  };
  /**
   * Title of the interface. This is the name that will be displayed in the UI
   */
  title: string;
  /**
   * Description of the interface. This is the description that will be displayed in the UI
   */
  description: string;
  /**
   * URL of the icon of the interface. This is the icon that will be displayed in the UI
   */
  iconUrl: string;
  /**
   * URL of the readme of the interface. This is the readme that will be displayed in the UI
   */
  readmeUrl: string;
  /**
   * Indicates if the interface is public. Public interfaces are available to all and cannot be updated without creating a new version.
   */
  public: boolean;
  /**
   * Optional key-value attributes from the interface definition
   */
  attributes?: {
    [k: string]: string;
  };
}

export interface Plugin {
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
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  botCount: number;
  billingVersion: "v1" | "v2" | "v3" | "v4";
  plan: "community" | "team" | "enterprise" | "plus" | "managed";
  blocked: boolean;
  spendingLimit: number;
  about?: string;
  profilePicture?: string;
  contactEmail?: string;
  website?: string;
  socialAccounts?: string[];
  isPublic?: boolean;
  handle?: string;
  activeTrialId: string | null;
}

export interface WorkspaceMember {
  id: string;
  userId?: string;
  email: string;
  createdAt: string;
  role: "viewer" | "billing" | "developer" | "manager" | "administrator" | "owner";
  profilePicture?: string;
  displayName?: string;
}

export interface Account {
  id: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
  profilePicture?: string;
  /**
   * Creation date of the [Account](#schema_account) in ISO 8601 format
   */
  createdAt: string;
}

export interface Usage {
  /**
   * Id of the usage that it is linked to. It can either be a workspace id or a bot id
   */
  id: string;
  /**
   * Period of the quota that it is applied to
   */
  period: string;
  /**
   * Value of the current usage
   */
  value: number;
  /**
   * Quota of the current usage
   */
  quota: number;
  /**
   * Usage type that can be used
   */
  type:
    | "invocation_timeout"
    | "invocation_calls"
    | "storage_count"
    | "bot_count"
    | "knowledgebase_vector_storage"
    | "workspace_ratelimit"
    | "table_row_count"
    | "workspace_member_count"
    | "integrations_owned_count"
    | "ai_spend"
    | "openai_spend"
    | "bing_search_spend"
    | "always_alive"
    | "indexed_file_count"
    | "file_max_size_bytes";
}

export interface Issue {
  id: string;
  code: string;
  createdAt: string;
  lastSeenAt: string;
  title: string;
  description: string;
  groupedData: {
    [k: string]: {
      raw: string;
      pretty?: string;
    };
  };
  eventsCount: number;
  category: "user_code" | "limits" | "configuration" | "other";
  resolutionLink: string | null;
}

export interface IssueEvent {
  id: string;
  createdAt: string;
  data: {
    [k: string]: {
      raw: string;
      pretty?: string;
    };
  };
}

export interface Activity {
  id: string;
  description: string;
  taskId: string;
  category:
    | "unknown"
    | "capture"
    | "bot_message"
    | "user_message"
    | "agent_message"
    | "event"
    | "action"
    | "task_status"
    | "subtask_status"
    | "exception";
  data: {
    [k: string]: any;
  };
  /**
   * Creation date of the activity in ISO 8601 format
   */
  createdAt: string;
}

export interface Version {
  id: string;
  name: string;
  description?: string;
}

