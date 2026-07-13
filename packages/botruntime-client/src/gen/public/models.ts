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

/**
 * The user object represents someone interacting with the bot within a specific integration. The same person interacting with a bot in slack and messenger will be represented with two different users.
 */
export interface User {
  /**
   * Id of the [User](#schema_user)
   */
  id: string;
  /**
   * Creation date of the [User](#schema_user) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Updating date of the [User](#schema_user) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Set of [Tags](/docs/developers/concepts/tags) that you can attach to a [User](#schema_user). The set of [Tags](/docs/developers/concepts/tags) available on a [User](#schema_user) is restricted by the list of [Tags](/docs/developers/concepts/tags) defined previously by the [Bot](#schema_bot). Individual keys can be unset by posting an empty value to them.
   */
  tags: {
    [k: string]: string;
  };
  /**
   * Name of the [User](#schema_user)
   */
  name?: string;
  /**
   * Picture URL of the [User](#schema_user)
   */
  pictureUrl?: string;
  /**
   * Optional properties
   */
  properties?: {
    [k: string]: string;
  };
  /**
   * Optional attributes
   */
  attributes?: {
    [k: string]: string;
  };
}

/**
 * The [Conversation](#schema_conversation) object represents an exchange of messages between one or more users. A [Conversation](#schema_conversation) is always linked to an integration's channels. For example, a Slack channel represents a conversation.
 */
export interface Conversation {
  /**
   * Id of the [Conversation](#schema_conversation)
   */
  id: string;
  /**
   * @deprecated
   * Unused. This field will be removed in the future.
   */
  currentTaskId?: string;
  /**
   * Creation date of the [Conversation](#schema_conversation) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Updating date of the [Conversation](#schema_conversation) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Name of the channel where the [Conversation](#schema_conversation) is happening
   */
  channel: string;
  /**
   * Name of the integration that created the [Conversation](#schema_conversation)
   */
  integration: string;
  /**
   * Set of [Tags](/docs/developers/concepts/tags) that you can attach to a [Conversation](#schema_conversation). The set of [Tags](/docs/developers/concepts/tags) available on a [Conversation](#schema_conversation) is restricted by the list of [Tags](/docs/developers/concepts/tags) defined previously by the [Bot](#schema_bot). Individual keys can be unset by posting an empty value to them.
   */
  tags: {
    [k: string]: string;
  };
  /**
   * Number of messages in the conversation
   */
  messageCount: number;
  /**
   * **EXPERIMENTAL** - Optional shared properties that can be accessed and modified by both the bot and any of its integrations.
   */
  properties?: {
    [k: string]: string;
  };
}

/**
 * The event object represents an action or an occurrence.
 */
export interface Event {
  /**
   * Id of the [Event](#schema_event)
   */
  id: string;
  /**
   * Creation date of the [Event](#schema_event) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Type of the [Event](#schema_event).
   */
  type: string;
  /**
   * Payload is the content of the event defined by the integration installed on your bot or one of the default events created by our api.
   */
  payload: {
    [k: string]: any;
  };
  /**
   * ID of the [Conversation](#schema_conversation) to link the event to.
   */
  conversationId?: string;
  /**
   * ID of the [User](#schema_user) to link the event to.
   */
  userId?: string;
  /**
   * ID of the [Message](#schema_message) to link the event to.
   */
  messageId?: string;
  status: "pending" | "processed" | "ignored" | "failed" | "scheduled" | "canceled";
  /**
   * Reason why the event failed to be processed
   */
  failureReason: string | null;
}

/**
 * The Message object represents a message in a [Conversation](#schema_conversation) for a specific [User](#schema_user).
 */
export interface Message {
  /**
   * Id of the [Message](#schema_message)
   */
  id: string;
  /**
   * Creation date of the [Message](#schema_message) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Update date of the [Message](#schema_message) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Type of the [Message](#schema_message) represents the resource type that the message is related to
   */
  type: string;
  /**
   * Payload is the content type of the message. Accepted payload options: Text, Image, Choice, Dropdown, Card, Carousel, File, Audio, Video, Location
   */
  payload: {
    [k: string]: any;
  };
  /**
   * Direction of the message (`incoming` or `outgoing`).
   */
  direction: "incoming" | "outgoing";
  /**
   * ID of the [User](#schema_user)
   */
  userId: string;
  /**
   * ID of the [Conversation](#schema_conversation)
   */
  conversationId: string;
  /**
   * Set of [Tags](/docs/developers/concepts/tags) that you can attach to a [Conversation](#schema_conversation). The set of [Tags](/docs/developers/concepts/tags) available on a [Conversation](#schema_conversation) is restricted by the list of [Tags](/docs/developers/concepts/tags) defined previously by the [Bot](#schema_bot). Individual keys can be unset by posting an empty value to them.
   */
  tags: {
    [k: string]: string;
  };
  /**
   * Origin of the message (`synthetic`).
   */
  origin?: "synthetic";
}

/**
 * The state object represents the current payload. A state is always linked to either a bot, a conversation or a user.
 */
export interface State {
  /**
   * Id of the [State](#schema_state)
   */
  id: string;
  /**
   * Creation date of the [State](#schema_state) in ISO 8601 format
   */
  createdAt: string;
  /**
   * Updating date of the [State](#schema_state) in ISO 8601 format
   */
  updatedAt: string;
  /**
   * Id of the [Bot](#schema_bot)
   */
  botId: string;
  /**
   * Id of the [Conversation](#schema_conversation)
   */
  conversationId?: string;
  /**
   * Id of the [User](#schema_user)
   */
  userId?: string;
  /**
   * Name of the [State](#schema_state) which is declared inside the bot definition
   */
  name: string;
  /**
   * Type of the [State](#schema_state) represents the resource type (`conversation`, `user`, `bot`, `integration` or `workflow`) that the state is related to
   */
  type: "conversation" | "user" | "bot" | "integration" | "workflow";
  /**
   * Payload is the content of the state defined by your bot.
   */
  payload: {
    [k: string]: any;
  };
  /**
   * Expiry of the state in milliseconds. The state will expire if it is idle for the configured value. Absent if no expiry is set.
   */
  expiry?: number;
  /**
   * Expiration date of the ${ref.state} in ISO 8601 format. Absent if no expiry is set.
   */
  expiresAt?: string;
}

/**
 * Workflow definition
 */
export interface Workflow {
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
}

export interface Table {
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
}

export interface Column {
  /**
   * Unique identifier for the column.
   */
  id?: string;
  /**
   * Name of the column, must be within length limits.
   */
  name: string;
  /**
   * Optional descriptive text about the column.
   */
  description?: string;
  /**
   * Indicates if the column is vectorized and searchable.
   */
  searchable?: boolean;
  /**
   * Specifies the data type of the column. Use "object" for complex data structures.
   */
  type: "string" | "number" | "boolean" | "date" | "object";
  /**
   * TypeScript typings for the column. Recommended if the type is "object", ex: "\{ foo: string; bar: number \}"
   */
  typings?: string;
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
  schema?: {
    [k: string]: any;
  };
}

export interface Row {
  /**
   * Unique identifier for the row.
   */
  id: number;
  /**
   * System-managed optimistic concurrency token for the row.
   */
  rowVersion: number;
  /**
   * Timestamp of row creation.
   */
  createdAt?: string;
  /**
   * Timestamp of the last row update.
   */
  updatedAt?: string;
  computed: {
    [k: string]: {
      status: string;
      error?: string;
      updatedBy?: string;
      updatedAt?: string;
    };
  };
  /**
   * [Read-only] List of stale values that are waiting to be recomputed.
   */
  stale?: string[];
  /**
   * Optional numeric value indicating similarity, when using findTableRows.
   */
  similarity?: number;
  [k: string]: any;
}

export interface File {
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
}

