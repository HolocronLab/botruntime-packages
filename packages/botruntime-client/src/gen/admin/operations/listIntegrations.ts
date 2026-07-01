// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListIntegrationsRequestHeaders {}

export interface ListIntegrationsRequestQuery {
  nextToken?: string;
  pageSize?: number;
  limit?: number;
  name?: string;
  version?: string;
  interfaceId?: string;
  interfaceName?: string;
  installedByBotId?: string;
  verificationStatus?: "unapproved" | "pending" | "approved" | "rejected";
  search?: string;
  sortBy?: "popularity" | "name" | "createdAt" | "updatedAt" | "installCount";
  direction?: "asc" | "desc";
  visibility?: "public" | "private";
  dev?: boolean;
}

export interface ListIntegrationsRequestParams {}

export interface ListIntegrationsRequestBody {}

export type ListIntegrationsInput = ListIntegrationsRequestBody & ListIntegrationsRequestHeaders & ListIntegrationsRequestQuery & ListIntegrationsRequestParams

export type ListIntegrationsRequest = {
  headers: ListIntegrationsRequestHeaders;
  query: ListIntegrationsRequestQuery;
  params: ListIntegrationsRequestParams;
  body: ListIntegrationsRequestBody;
}

export const parseReq = (input: ListIntegrationsInput): ListIntegrationsRequest & { path: string } => {
  return {
    path: `/v1/admin/integrations`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'limit': input['limit'], 'name': input['name'], 'version': input['version'], 'interfaceId': input['interfaceId'], 'interfaceName': input['interfaceName'], 'installedByBotId': input['installedByBotId'], 'verificationStatus': input['verificationStatus'], 'search': input['search'], 'sortBy': input['sortBy'], 'direction': input['direction'], 'visibility': input['visibility'], 'dev': input['dev'] },
    params: {  },
    body: {  },
  }
}

export interface ListIntegrationsResponse {
  integrations: {
    /**
     * ID of the [Integration](#schema_integration)
     */
    id: string;
    /**
     * Name of the [Integration](#schema_integration)
     */
    name: string;
    /**
     * Version of the [Integration](#schema_integration)
     */
    version: string;
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
    /**
     * Metadata about which fields matched the search criteria
     */
    matchedOn?: {
      /**
       * Whether the integration name matched the search term
       */
      name?: boolean;
      /**
       * Whether the integration title matched the search term
       */
      title?: boolean;
      /**
       * Whether the integration description matched the search term
       */
      description?: boolean;
      /**
       * Action names that matched the search term
       */
      actions?: string[];
      /**
       * Interface names that matched the search term
       */
      interfaces?: string[];
    };
    ownerWorkspace?: {
      id: string;
      handle: string | null;
      name: string;
    };
    /**
     * Optional key-value attributes from the integration definition
     */
    attributes?: {
      [k: string]: string;
    };
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

