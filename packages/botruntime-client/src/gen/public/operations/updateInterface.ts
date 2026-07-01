// this file was automatically generated, do not edit
/* eslint-disable */

export interface UpdateInterfaceRequestHeaders {}

export interface UpdateInterfaceRequestQuery {}

export interface UpdateInterfaceRequestParams {
  id: string;
}

export interface UpdateInterfaceRequestBody {
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
    } | null;
  };
  /**
   * Template string optionaly used at build time by integrations implementing this interface to pick a name for actions and events.
   */
  nameTemplate?: {
    script: string;
    language: string;
  } | null;
  sdkVersion?: string;
  /**
   * Base64 encoded svg of the interface icon. This icon is global to the interface each versions will be updated when this changes.
   */
  icon?: string;
  /**
   * Base64 encoded markdown of the interface readme. The readme is specific to each interface versions.
   */
  readme?: string;
  /**
   * Title of the interface. This is the name that will be displayed in the UI
   */
  title?: string;
  /**
   * Description of the interface. This is the description that will be displayed in the UI
   */
  description?: string;
  /**
   * Indicates if the interface is public. Public interfaces are available to all and cannot be updated without creating a new version.
   */
  public?: boolean;
  /**
   * Optional key-value attributes. Set attributes to null to remove them
   */
  attributes?: {
    [k: string]: string | null;
  };
}

export type UpdateInterfaceInput = UpdateInterfaceRequestBody & UpdateInterfaceRequestHeaders & UpdateInterfaceRequestQuery & UpdateInterfaceRequestParams

export type UpdateInterfaceRequest = {
  headers: UpdateInterfaceRequestHeaders;
  query: UpdateInterfaceRequestQuery;
  params: UpdateInterfaceRequestParams;
  body: UpdateInterfaceRequestBody;
}

export const parseReq = (input: UpdateInterfaceInput): UpdateInterfaceRequest & { path: string } => {
  return {
    path: `/v1/admin/interfaces/${encodeURIComponent(input['id'])}`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'entities': input['entities'], 'events': input['events'], 'actions': input['actions'], 'channels': input['channels'], 'nameTemplate': input['nameTemplate'], 'sdkVersion': input['sdkVersion'], 'icon': input['icon'], 'readme': input['readme'], 'title': input['title'], 'description': input['description'], 'public': input['public'], 'attributes': input['attributes'] },
  }
}

export interface UpdateInterfaceResponse {
  interface: {
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
  };
}

