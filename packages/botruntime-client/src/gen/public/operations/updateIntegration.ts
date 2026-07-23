// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpdateIntegrationRequestHeaders {}

export interface UpdateIntegrationRequestQuery {}

export interface UpdateIntegrationRequestParams {
  id: string;
}

export interface UpdateIntegrationRequestBody {
  /**
   * Default configuration definition of the integration
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
    schema?: {
      [k: string]: any;
    };
    identifier?: {
      linkTemplateScript?: string | null;
      required?: boolean;
    };
  };
  /**
   * Additional configuration definitions of the integration
   */
  configurations?: {
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
       * Schema of the configuration in the `JSON schema` format. The configuration data is validated against this `JSON schema`.
       */
      schema?: {
        [k: string]: any;
      };
      identifier?: {
        linkTemplateScript?: string | null;
        required?: boolean;
      };
    } | null;
  };
  /**
   * **EXPERIMENTAL** extra integration operations enabled for this integration. Keys map to operation names. A value of `null` or `{ enabled: false }` removes the operation; `{ enabled: true }` enables it. Operations that are not provided are left unchanged.
   */
  extraOperations?: {
    [k: string]: {
      enabled: boolean;
    } | null;
  };
  sdkVersion?: string;
  channels?: {
    [k: string]: {
      /**
       * Title of the channel
       */
      title?: string;
      /**
       * Description of the channel
       */
      description?: string;
      messages?: {
        /**
         * Message definition
         */
        [k: string]: {
          schema: {
            [k: string]: any;
          };
        } | null;
      };
      conversation?: {
        /**
         * The conversation creation setting determines how to create a conversation through the API directly. The integration will have to implement the `createConversation` functionality to support this setting.
         */
        creation?: {
          /**
           * Enable conversation creation
           */
          enabled: boolean;
          /**
           * The list of tags that are required to be specified when calling the API directly to create a conversation.
           */
          requiredTags: string[];
        };
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
          } | null;
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
          } | null;
        };
      };
    } | null;
  };
  /**
   * Maximum execution time of the integration (in seconds).
   */
  maxExecutionTime?: number;
  identifier?: {
    extractScript?: string | null;
    fallbackHandlerScript?: string | null;
  };
  actions?: {
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
       * Optional attributes. Set attributes to null to remove them
       */
      attributes?: {
        [k: string]: string | null;
      };
    } | null;
  };
  events?: {
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
       * Optional attributes. Set attributes to null to remove them
       */
      attributes?: {
        [k: string]: string | null;
      };
    } | null;
  };
  states?: {
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
    } | null;
  };
  user?: {
    /**
     * The user creation setting determines how to create a user through the API directly. The integration will have to implement the `createUser` functionality to support this setting.
     */
    creation?: {
      /**
       * Enable user creation
       */
      enabled: boolean;
      /**
       * The list of tags that are required to be specified when calling the API directly to create a user.
       */
      requiredTags: string[];
    };
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
      } | null;
    };
  };
  entities?: {
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
    } | null;
  };
  interfaces?: {
    [k: string]: {
      /**
       * ID of the interface
       */
      id: string;
      entities?: {
        [k: string]: {
          name: string;
        };
      };
      actions?: {
        [k: string]: {
          name: string;
        };
      };
      events?: {
        [k: string]: {
          name: string;
        };
      };
      channels?: {
        [k: string]: {
          name: string;
        };
      };
    } | null;
  };
  /**
   * Optional key-value attributes. Set attributes to null to remove them
   */
  attributes?: {
    [k: string]: string | null;
  };
  /**
   * Secrets are integration-wide values available in the code via environment variables formatted with a SECRET_ prefix followed by your secret name. A secret name must respect SCREAMING_SNAKE casing.
   */
  secrets?: {
    [k: string]: string | null;
  };
  /**
   * JavaScript code of the integration
   */
  code?: string;
  /**
   * Base64 encoded svg of the integration icon. This icon is global to the integration each versions will be updated when this changes.
   */
  icon?: string;
  /**
   * Base64 encoded markdown of the integration readme. The readme is specific to each integration versions.
   */
  readme?: string;
  /**
   * Title of the integration. This is the name that will be displayed in the UI
   */
  title?: string;
  /**
   * Description of the integration. This is the description that will be displayed in the UI
   */
  description?: string;
  /**
   * URL of the integration
   */
  url?: string | null;
  /**
   * @deprecated
   * [DEPRECATED] Indicates whether the integration is public. Please use the "visibility" parameter instead.
   */
  public?: boolean;
  /**
   * The integration's visibility. Public integrations are available to all and cannot be updated without creating a new version. Unlisted integrations behave identically to public integrations, but they are not listed in the integration hub. By default, integrations are private and only accessible to the workspace that created them.
   */
  visibility?: "public" | "private" | "unlisted";
  layers?: string[];
  /**
   * Maximum concurrent integration invocations. Definitions that omit this field run one invocation at a time.
   */
  maxConcurrency?: number;
  /**
   * Outbound host allowlist declared by the integration.
   */
  providerHosts?: string[];
  /**
   * Whether inbound webhook traffic is relayed through the platform.
   */
  ingressRelayed?: boolean;
  /**
   * Authentication mode enforced for inbound webhooks.
   */
  webhookAuthMode?: "shared_secret" | "provider_verified" | "handler_verified";
}

export type UpdateIntegrationInput = UpdateIntegrationRequestBody & UpdateIntegrationRequestHeaders & UpdateIntegrationRequestQuery & UpdateIntegrationRequestParams

export type UpdateIntegrationRequest = {
  headers: UpdateIntegrationRequestHeaders;
  query: UpdateIntegrationRequestQuery;
  params: UpdateIntegrationRequestParams;
  body: UpdateIntegrationRequestBody;
}

export const parseReq = (input: UpdateIntegrationInput): UpdateIntegrationRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'configuration': input['configuration'], 'configurations': input['configurations'], 'extraOperations': input['extraOperations'], 'sdkVersion': input['sdkVersion'], 'channels': input['channels'], 'maxExecutionTime': input['maxExecutionTime'], 'identifier': input['identifier'], 'actions': input['actions'], 'events': input['events'], 'states': input['states'], 'user': input['user'], 'entities': input['entities'], 'interfaces': input['interfaces'], 'attributes': input['attributes'], 'secrets': input['secrets'], 'code': input['code'], 'icon': input['icon'], 'readme': input['readme'], 'title': input['title'], 'description': input['description'], 'url': input['url'], 'public': input['public'], 'visibility': input['visibility'], 'layers': input['layers'], 'maxConcurrency': input['maxConcurrency'], 'providerHosts': input['providerHosts'], 'ingressRelayed': input['ingressRelayed'], 'webhookAuthMode': input['webhookAuthMode'] },
  }
}

export interface UpdateIntegrationResponse {
  integration: {
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
  };
}

