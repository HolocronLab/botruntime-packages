// this file was automatically generated, do not edit
/* eslint-disable */

export interface ListPublicInterfacesRequestHeaders {}

export interface ListPublicInterfacesRequestQuery {
  nextToken?: string;
  pageSize?: number;
  name?: string;
  version?: string;
}

export interface ListPublicInterfacesRequestParams {}

export interface ListPublicInterfacesRequestBody {}

export type ListPublicInterfacesInput = ListPublicInterfacesRequestBody & ListPublicInterfacesRequestHeaders & ListPublicInterfacesRequestQuery & ListPublicInterfacesRequestParams

export type ListPublicInterfacesRequest = {
  headers: ListPublicInterfacesRequestHeaders;
  query: ListPublicInterfacesRequestQuery;
  params: ListPublicInterfacesRequestParams;
  body: ListPublicInterfacesRequestBody;
}

export const parseReq = (input: ListPublicInterfacesInput): ListPublicInterfacesRequest & { path: string } => {
  return {
    path: `/v1/admin/hub/interfaces`,
    headers: {  },
    query: { 'nextToken': input['nextToken'], 'pageSize': input['pageSize'], 'name': input['name'], 'version': input['version'] },
    params: {  },
    body: {  },
  }
}

export interface ListPublicInterfacesResponse {
  interfaces: {
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
  }[];
  meta: {
    /**
     * The token to use to retrieve the next page of results, passed as a query string parameter (value should be URL-encoded) to this API endpoint.
     */
    nextToken?: string;
  };
}

