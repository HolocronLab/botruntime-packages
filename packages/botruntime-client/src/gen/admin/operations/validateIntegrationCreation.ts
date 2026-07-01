// this file was automatically generated, do not edit
/* eslint-disable */

export interface ValidateIntegrationCreationRequestHeaders {}

export interface ValidateIntegrationCreationRequestQuery {}

export interface ValidateIntegrationCreationRequestParams {}

export interface ValidateIntegrationCreationRequestBody {
  /**
   * Name of the [Integration](#schema_integration)
   */
  name: string;
  /**
   * Version of the [Integration](#schema_integration)
   */
  version: string;
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
      required?: boolean;
      linkTemplateScript?: string;
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
        required?: boolean;
        linkTemplateScript?: string;
      };
    };
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
    };
  };
  identifier?: {
    fallbackHandlerScript?: string;
    extractScript?: string;
  };
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
    };
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
      };
    };
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
    };
  };
  /**
   * **EXPERIMENTAL** Extra integration operations that should be sent or not to the integration instances. The key is the operation name.
   */
  extraOperations?: {
    [k: string]: {
      enabled: boolean;
    };
  };
  sdkVersion?: string;
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
   * URL of the integration
   */
  url?: string;
  /**
   * Indicates if the integration is a development integration; Dev integrations run locally
   */
  dev?: boolean;
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
   * Optional key-value attributes from the integration definition
   */
  attributes?: {
    [k: string]: string;
  };
}

export type ValidateIntegrationCreationInput = ValidateIntegrationCreationRequestBody & ValidateIntegrationCreationRequestHeaders & ValidateIntegrationCreationRequestQuery & ValidateIntegrationCreationRequestParams

export type ValidateIntegrationCreationRequest = {
  headers: ValidateIntegrationCreationRequestHeaders;
  query: ValidateIntegrationCreationRequestQuery;
  params: ValidateIntegrationCreationRequestParams;
  body: ValidateIntegrationCreationRequestBody;
}

export const parseReq = (input: ValidateIntegrationCreationInput): ValidateIntegrationCreationRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations/validate`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'name': input['name'], 'version': input['version'], 'configuration': input['configuration'], 'configurations': input['configurations'], 'states': input['states'], 'events': input['events'], 'actions': input['actions'], 'entities': input['entities'], 'identifier': input['identifier'], 'channels': input['channels'], 'user': input['user'], 'interfaces': input['interfaces'], 'extraOperations': input['extraOperations'], 'sdkVersion': input['sdkVersion'], 'secrets': input['secrets'], 'code': input['code'], 'url': input['url'], 'dev': input['dev'], 'icon': input['icon'], 'readme': input['readme'], 'title': input['title'], 'description': input['description'], 'public': input['public'], 'visibility': input['visibility'], 'layers': input['layers'], 'attributes': input['attributes'] },
  }
}

export interface ValidateIntegrationCreationResponse {}

