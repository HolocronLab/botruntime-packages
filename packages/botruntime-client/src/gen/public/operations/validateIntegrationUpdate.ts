// this file was automatically generated, do not edit
/* eslint-disable */

export interface ValidateIntegrationUpdateRequestHeaders {}

export interface ValidateIntegrationUpdateRequestQuery {}

export interface ValidateIntegrationUpdateRequestParams {
  id: string;
}

export interface ValidateIntegrationUpdateRequestBody {
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
  webhookAuthMode?: "shared_secret" | "provider_verified";
}

export type ValidateIntegrationUpdateInput = ValidateIntegrationUpdateRequestBody & ValidateIntegrationUpdateRequestHeaders & ValidateIntegrationUpdateRequestQuery & ValidateIntegrationUpdateRequestParams

export type ValidateIntegrationUpdateRequest = {
  headers: ValidateIntegrationUpdateRequestHeaders;
  query: ValidateIntegrationUpdateRequestQuery;
  params: ValidateIntegrationUpdateRequestParams;
  body: ValidateIntegrationUpdateRequestBody;
}

export const parseReq = (input: ValidateIntegrationUpdateInput): ValidateIntegrationUpdateRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations/${encodeURIComponent(input['id'])}/validate`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'configuration': input['configuration'], 'configurations': input['configurations'], 'extraOperations': input['extraOperations'], 'sdkVersion': input['sdkVersion'], 'channels': input['channels'], 'maxExecutionTime': input['maxExecutionTime'], 'identifier': input['identifier'], 'actions': input['actions'], 'events': input['events'], 'states': input['states'], 'user': input['user'], 'entities': input['entities'], 'interfaces': input['interfaces'], 'attributes': input['attributes'], 'secrets': input['secrets'], 'code': input['code'], 'icon': input['icon'], 'readme': input['readme'], 'title': input['title'], 'description': input['description'], 'url': input['url'], 'public': input['public'], 'visibility': input['visibility'], 'layers': input['layers'], 'providerHosts': input['providerHosts'], 'ingressRelayed': input['ingressRelayed'], 'webhookAuthMode': input['webhookAuthMode'] },
  }
}

export interface ValidateIntegrationUpdateResponse {}

