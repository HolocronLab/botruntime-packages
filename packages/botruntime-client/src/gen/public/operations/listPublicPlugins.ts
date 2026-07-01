// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListPublicPluginsRequestHeaders {}

export interface ListPublicPluginsRequestQuery {
  nextToken?: string;
  pageSize?: number;
  name?: string;
  version?: string;
}

export interface ListPublicPluginsRequestParams {}

export interface ListPublicPluginsRequestBody {}

export type ListPublicPluginsInput = ListPublicPluginsRequestBody & ListPublicPluginsRequestHeaders & ListPublicPluginsRequestQuery & ListPublicPluginsRequestParams

export type ListPublicPluginsRequest = {
  headers: ListPublicPluginsRequestHeaders;
  query: ListPublicPluginsRequestQuery;
  params: ListPublicPluginsRequestParams;
  body: ListPublicPluginsRequestBody;
}

export const parseReq = (input: ListPublicPluginsInput): ListPublicPluginsRequest & { path: string } => {
  return {
    path: `/v1/admin/hub/plugins`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'name': input['name'], 'version': input['version'] },
    params: {  },
    body: {  },
  }
}

export interface ListPublicPluginsResponse {
  plugins: {
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
     * Name of the [Plugin](#schema_plugin)
     */
    name: string;
    /**
     * Version of the [Plugin](#schema_plugin)
     */
    version: string;
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
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

