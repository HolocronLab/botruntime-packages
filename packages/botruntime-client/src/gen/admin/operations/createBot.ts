// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateBotRequestHeaders {}

export interface CreateBotRequestQuery {}

export interface CreateBotRequestParams {}

export interface CreateBotRequestBody {
  /**
   * A mapping of states to their definition
   */
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
  /**
   * Events definition
   */
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
  recurringEvents?: {
    [k: string]: {
      schedule: {
        cron: string;
      };
      type: string;
      payload: {
        [k: string]: any;
      };
    };
  };
  /**
   * Subscriptions of the bot
   */
  subscriptions?: {
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
  configuration?: {
    /**
     * Configuration data
     */
    data?: {
      [k: string]: any;
    };
    /**
     * Schema of the configuration in the `JSON schema` format. The configuration data is validated against this `JSON schema`.
     */
    schema?: {
      [k: string]: any;
    };
  };
  user?: {
    tags?: {
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
  conversation?: {
    tags?: {
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
  message?: {
    tags?: {
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
   * Optional attributes of the [Bot](#schema_bot)
   */
  tags?: {
    [k: string]: string;
  };
  /**
   * JavaScript code of the bot
   */
  code?: string;
  /**
   * Optional name for the bot, if not provided will be auto-generated
   */
  name?: string;
  /**
   * Optional description for the bot
   */
  description?: string;
  /**
   * Media files associated with the [Bot](#schema_bot)
   */
  medias?: {
    url: string;
    name: string;
  }[];
  /**
   * URL of the [Bot](#schema_bot)
   */
  url?: string;
  /**
   * Secrets are values available in the code via environment variables formatted with a SECRET_ prefix followed by your secret name. A secret name must respect SCREAMING_SNAKE casing.
   */
  secrets?: {
    [k: string]: string;
  };
  /**
   * Indicates if the [Bot](#schema_bot) is a development bot; Development bots run locally and can install dev integrations
   */
  dev?: boolean;
  /**
   * Type of the [Bot](#schema_bot)
   */
  type?: "studio" | "adk" | "desk";
  /**
   * Maximum execution time (in seconds).
   */
  maxExecutionTime?: number;
}

export type CreateBotInput = CreateBotRequestBody & CreateBotRequestHeaders & CreateBotRequestQuery & CreateBotRequestParams

export type CreateBotRequest = {
  headers: CreateBotRequestHeaders;
  query: CreateBotRequestQuery;
  params: CreateBotRequestParams;
  body: CreateBotRequestBody;
}

export const parseReq = (input: CreateBotInput): CreateBotRequest & { path: string } => {
  return {
    path: `/v1/admin/bots`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'states': input['states'], 'events': input['events'], 'recurringEvents': input['recurringEvents'], 'subscriptions': input['subscriptions'], 'actions': input['actions'], 'configuration': input['configuration'], 'user': input['user'], 'conversation': input['conversation'], 'message': input['message'], 'tags': input['tags'], 'code': input['code'], 'name': input['name'], 'description': input['description'], 'medias': input['medias'], 'url': input['url'], 'secrets': input['secrets'], 'dev': input['dev'], 'type': input['type'], 'maxExecutionTime': input['maxExecutionTime'] },
  }
}

export interface CreateBotResponse {
  bot: {
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
  };
}

