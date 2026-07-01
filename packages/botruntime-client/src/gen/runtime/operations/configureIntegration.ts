// this file was automatically generated, do not edit
/* eslint-disable */

export interface ConfigureIntegrationRequestHeaders {}

export interface ConfigureIntegrationRequestQuery {}

export interface ConfigureIntegrationRequestParams {}

export interface ConfigureIntegrationRequestBody {
  /**
   * Unique identifier of the integration that was installed on the bot
   */
  identifier?: string | null;
  /**
   * Recurring schedule on which `register()` will be called on the integration
   */
  scheduleRegisterCall?:
    | "hourly"
    | "daily"
    | "weekly"
    | "bi-weekly"
    | "monthly"
    | "bi-monthly"
    | "quarterly"
    | "yearly";
  /**
   * **EXPERIMENTAL** Sandbox identifiers for the integration. Setting this to null will remove all sandbox identifiers.           This is an experimental feature meant to be used by specific integrations.
   */
  sandboxIdentifiers?: {} | null;
}

export type ConfigureIntegrationInput = ConfigureIntegrationRequestBody & ConfigureIntegrationRequestHeaders & ConfigureIntegrationRequestQuery & ConfigureIntegrationRequestParams

export type ConfigureIntegrationRequest = {
  headers: ConfigureIntegrationRequestHeaders;
  query: ConfigureIntegrationRequestQuery;
  params: ConfigureIntegrationRequestParams;
  body: ConfigureIntegrationRequestBody;
}

export const parseReq = (input: ConfigureIntegrationInput): ConfigureIntegrationRequest & { path: string } => {
  return {
    path: `/v1/chat/integrations/configure`,
    headers: {  },
    query: {  },
    params: {  },
    body: { 'identifier': input['identifier'], 'scheduleRegisterCall': input['scheduleRegisterCall'], 'sandboxIdentifiers': input['sandboxIdentifiers'] },
  }
}

export interface ConfigureIntegrationResponse {}

