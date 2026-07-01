// this file was automatically generated, do not edit
/* eslint-disable */

import axios, { AxiosInstance } from 'axios'
import { errorFrom } from './errors'
import { toAxiosRequest } from './to-axios'
import * as runVrl from './operations/runVrl'
import * as getAccount from './operations/getAccount'
import * as updateAccount from './operations/updateAccount'
import * as deleteAccount from './operations/deleteAccount'
import * as listPersonalAccessTokens from './operations/listPersonalAccessTokens'
import * as createPersonalAccessToken from './operations/createPersonalAccessToken'
import * as deletePersonalAccessToken from './operations/deletePersonalAccessToken'
import * as setAccountPreference from './operations/setAccountPreference'
import * as getAccountPreference from './operations/getAccountPreference'
import * as listPublicIntegrations from './operations/listPublicIntegrations'
import * as getPublicIntegrationById from './operations/getPublicIntegrationById'
import * as getPublicIntegration from './operations/getPublicIntegration'
import * as listPublicPlugins from './operations/listPublicPlugins'
import * as getPublicPluginById from './operations/getPublicPluginById'
import * as getDereferencedPublicPluginById from './operations/getDereferencedPublicPluginById'
import * as getPublicPlugin from './operations/getPublicPlugin'
import * as getPublicPluginCode from './operations/getPublicPluginCode'
import * as listPublicInterfaces from './operations/listPublicInterfaces'
import * as getPublicInterfaceById from './operations/getPublicInterfaceById'
import * as getPublicInterface from './operations/getPublicInterface'
import * as createBot from './operations/createBot'
import * as updateBot from './operations/updateBot'
import * as rotateBotSigningSecrets from './operations/rotateBotSigningSecrets'
import * as transferBot from './operations/transferBot'
import * as listBots from './operations/listBots'
import * as getBot from './operations/getBot'
import * as deleteBot from './operations/deleteBot'
import * as getBotLogs from './operations/getBotLogs'
import * as getBotWebchat from './operations/getBotWebchat'
import * as getBotAnalytics from './operations/getBotAnalytics'
import * as listActionRuns from './operations/listActionRuns'
import * as getBotIssue from './operations/getBotIssue'
import * as listBotIssues from './operations/listBotIssues'
import * as deleteBotIssue from './operations/deleteBotIssue'
import * as listBotIssueEvents from './operations/listBotIssueEvents'
import * as listBotVersions from './operations/listBotVersions'
import * as getBotVersion from './operations/getBotVersion'
import * as getBotJson from './operations/getBotJson'
import * as publishFromBotJson from './operations/publishFromBotJson'
import * as createBotVersion from './operations/createBotVersion'
import * as deployBotVersion from './operations/deployBotVersion'
import * as createIntegrationShareableId from './operations/createIntegrationShareableId'
import * as deleteIntegrationShareableId from './operations/deleteIntegrationShareableId'
import * as getIntegrationShareableId from './operations/getIntegrationShareableId'
import * as unlinkSandboxedConversations from './operations/unlinkSandboxedConversations'
import * as listBotApiKeys from './operations/listBotApiKeys'
import * as createBotApiKey from './operations/createBotApiKey'
import * as deleteBotApiKey from './operations/deleteBotApiKey'
import * as getBotAllowlist from './operations/getBotAllowlist'
import * as updateBotAllowlist from './operations/updateBotAllowlist'
import * as migrateWorkspaceToV4 from './operations/migrateWorkspaceToV4'
import * as listWorkspaceInvoices from './operations/listWorkspaceInvoices'
import * as getUpcomingInvoice from './operations/getUpcomingInvoice'
import * as chargeWorkspaceUnpaidInvoices from './operations/chargeWorkspaceUnpaidInvoices'
import * as createWorkspace from './operations/createWorkspace'
import * as getPublicWorkspace from './operations/getPublicWorkspace'
import * as getWorkspace from './operations/getWorkspace'
import * as listWorkspaceUsages from './operations/listWorkspaceUsages'
import * as breakDownWorkspaceUsageByBot from './operations/breakDownWorkspaceUsageByBot'
import * as getAllWorkspaceQuotaCompletion from './operations/getAllWorkspaceQuotaCompletion'
import * as getWorkspaceQuota from './operations/getWorkspaceQuota'
import * as listWorkspaceQuotas from './operations/listWorkspaceQuotas'
import * as updateWorkspace from './operations/updateWorkspace'
import * as checkHandleAvailability from './operations/checkHandleAvailability'
import * as listWorkspaces from './operations/listWorkspaces'
import * as listPublicWorkspaces from './operations/listPublicWorkspaces'
import * as deleteWorkspace from './operations/deleteWorkspace'
import * as getAuditRecords from './operations/getAuditRecords'
import * as setWorkspacePreference from './operations/setWorkspacePreference'
import * as getWorkspacePreference from './operations/getWorkspacePreference'
import * as listWorkspaceMembers from './operations/listWorkspaceMembers'
import * as getWorkspaceMember from './operations/getWorkspaceMember'
import * as deleteWorkspaceMember from './operations/deleteWorkspaceMember'
import * as createWorkspaceMember from './operations/createWorkspaceMember'
import * as updateWorkspaceMember from './operations/updateWorkspaceMember'
import * as listIntegrationApiKeys from './operations/listIntegrationApiKeys'
import * as createIntegrationApiKey from './operations/createIntegrationApiKey'
import * as deleteIntegrationApiKey from './operations/deleteIntegrationApiKey'
import * as createIntegration from './operations/createIntegration'
import * as validateIntegrationCreation from './operations/validateIntegrationCreation'
import * as updateIntegration from './operations/updateIntegration'
import * as rotateIntegrationSigningSecrets from './operations/rotateIntegrationSigningSecrets'
import * as validateIntegrationUpdate from './operations/validateIntegrationUpdate'
import * as listIntegrations from './operations/listIntegrations'
import * as getIntegration from './operations/getIntegration'
import * as getIntegrationLogs from './operations/getIntegrationLogs'
import * as getIntegrationByName from './operations/getIntegrationByName'
import * as deleteIntegration from './operations/deleteIntegration'
import * as requestIntegrationVerification from './operations/requestIntegrationVerification'
import * as createInterface from './operations/createInterface'
import * as getInterface from './operations/getInterface'
import * as getInterfaceByName from './operations/getInterfaceByName'
import * as updateInterface from './operations/updateInterface'
import * as deleteInterface from './operations/deleteInterface'
import * as listInterfaces from './operations/listInterfaces'
import * as createPlugin from './operations/createPlugin'
import * as getPlugin from './operations/getPlugin'
import * as getDereferencedPlugin from './operations/getDereferencedPlugin'
import * as getPluginByName from './operations/getPluginByName'
import * as updatePlugin from './operations/updatePlugin'
import * as deletePlugin from './operations/deletePlugin'
import * as listPlugins from './operations/listPlugins'
import * as getPluginCode from './operations/getPluginCode'
import * as getUsage from './operations/getUsage'
import * as getMultipleUsages from './operations/getMultipleUsages'
import * as listUsageHistory from './operations/listUsageHistory'
import * as listUsageActivity from './operations/listUsageActivity'
import * as listUsageActivityDaily from './operations/listUsageActivityDaily'
import * as changeAISpendQuota from './operations/changeAISpendQuota'
import * as listActivities from './operations/listActivities'
import * as introspect from './operations/introspect'

export * from './models'

export * as runVrl from './operations/runVrl'
export * as getAccount from './operations/getAccount'
export * as updateAccount from './operations/updateAccount'
export * as deleteAccount from './operations/deleteAccount'
export * as listPersonalAccessTokens from './operations/listPersonalAccessTokens'
export * as createPersonalAccessToken from './operations/createPersonalAccessToken'
export * as deletePersonalAccessToken from './operations/deletePersonalAccessToken'
export * as setAccountPreference from './operations/setAccountPreference'
export * as getAccountPreference from './operations/getAccountPreference'
export * as listPublicIntegrations from './operations/listPublicIntegrations'
export * as getPublicIntegrationById from './operations/getPublicIntegrationById'
export * as getPublicIntegration from './operations/getPublicIntegration'
export * as listPublicPlugins from './operations/listPublicPlugins'
export * as getPublicPluginById from './operations/getPublicPluginById'
export * as getDereferencedPublicPluginById from './operations/getDereferencedPublicPluginById'
export * as getPublicPlugin from './operations/getPublicPlugin'
export * as getPublicPluginCode from './operations/getPublicPluginCode'
export * as listPublicInterfaces from './operations/listPublicInterfaces'
export * as getPublicInterfaceById from './operations/getPublicInterfaceById'
export * as getPublicInterface from './operations/getPublicInterface'
export * as createBot from './operations/createBot'
export * as updateBot from './operations/updateBot'
export * as rotateBotSigningSecrets from './operations/rotateBotSigningSecrets'
export * as transferBot from './operations/transferBot'
export * as listBots from './operations/listBots'
export * as getBot from './operations/getBot'
export * as deleteBot from './operations/deleteBot'
export * as getBotLogs from './operations/getBotLogs'
export * as getBotWebchat from './operations/getBotWebchat'
export * as getBotAnalytics from './operations/getBotAnalytics'
export * as listActionRuns from './operations/listActionRuns'
export * as getBotIssue from './operations/getBotIssue'
export * as listBotIssues from './operations/listBotIssues'
export * as deleteBotIssue from './operations/deleteBotIssue'
export * as listBotIssueEvents from './operations/listBotIssueEvents'
export * as listBotVersions from './operations/listBotVersions'
export * as getBotVersion from './operations/getBotVersion'
export * as getBotJson from './operations/getBotJson'
export * as publishFromBotJson from './operations/publishFromBotJson'
export * as createBotVersion from './operations/createBotVersion'
export * as deployBotVersion from './operations/deployBotVersion'
export * as createIntegrationShareableId from './operations/createIntegrationShareableId'
export * as deleteIntegrationShareableId from './operations/deleteIntegrationShareableId'
export * as getIntegrationShareableId from './operations/getIntegrationShareableId'
export * as unlinkSandboxedConversations from './operations/unlinkSandboxedConversations'
export * as listBotApiKeys from './operations/listBotApiKeys'
export * as createBotApiKey from './operations/createBotApiKey'
export * as deleteBotApiKey from './operations/deleteBotApiKey'
export * as getBotAllowlist from './operations/getBotAllowlist'
export * as updateBotAllowlist from './operations/updateBotAllowlist'
export * as migrateWorkspaceToV4 from './operations/migrateWorkspaceToV4'
export * as listWorkspaceInvoices from './operations/listWorkspaceInvoices'
export * as getUpcomingInvoice from './operations/getUpcomingInvoice'
export * as chargeWorkspaceUnpaidInvoices from './operations/chargeWorkspaceUnpaidInvoices'
export * as createWorkspace from './operations/createWorkspace'
export * as getPublicWorkspace from './operations/getPublicWorkspace'
export * as getWorkspace from './operations/getWorkspace'
export * as listWorkspaceUsages from './operations/listWorkspaceUsages'
export * as breakDownWorkspaceUsageByBot from './operations/breakDownWorkspaceUsageByBot'
export * as getAllWorkspaceQuotaCompletion from './operations/getAllWorkspaceQuotaCompletion'
export * as getWorkspaceQuota from './operations/getWorkspaceQuota'
export * as listWorkspaceQuotas from './operations/listWorkspaceQuotas'
export * as updateWorkspace from './operations/updateWorkspace'
export * as checkHandleAvailability from './operations/checkHandleAvailability'
export * as listWorkspaces from './operations/listWorkspaces'
export * as listPublicWorkspaces from './operations/listPublicWorkspaces'
export * as deleteWorkspace from './operations/deleteWorkspace'
export * as getAuditRecords from './operations/getAuditRecords'
export * as setWorkspacePreference from './operations/setWorkspacePreference'
export * as getWorkspacePreference from './operations/getWorkspacePreference'
export * as listWorkspaceMembers from './operations/listWorkspaceMembers'
export * as getWorkspaceMember from './operations/getWorkspaceMember'
export * as deleteWorkspaceMember from './operations/deleteWorkspaceMember'
export * as createWorkspaceMember from './operations/createWorkspaceMember'
export * as updateWorkspaceMember from './operations/updateWorkspaceMember'
export * as listIntegrationApiKeys from './operations/listIntegrationApiKeys'
export * as createIntegrationApiKey from './operations/createIntegrationApiKey'
export * as deleteIntegrationApiKey from './operations/deleteIntegrationApiKey'
export * as createIntegration from './operations/createIntegration'
export * as validateIntegrationCreation from './operations/validateIntegrationCreation'
export * as updateIntegration from './operations/updateIntegration'
export * as rotateIntegrationSigningSecrets from './operations/rotateIntegrationSigningSecrets'
export * as validateIntegrationUpdate from './operations/validateIntegrationUpdate'
export * as listIntegrations from './operations/listIntegrations'
export * as getIntegration from './operations/getIntegration'
export * as getIntegrationLogs from './operations/getIntegrationLogs'
export * as getIntegrationByName from './operations/getIntegrationByName'
export * as deleteIntegration from './operations/deleteIntegration'
export * as requestIntegrationVerification from './operations/requestIntegrationVerification'
export * as createInterface from './operations/createInterface'
export * as getInterface from './operations/getInterface'
export * as getInterfaceByName from './operations/getInterfaceByName'
export * as updateInterface from './operations/updateInterface'
export * as deleteInterface from './operations/deleteInterface'
export * as listInterfaces from './operations/listInterfaces'
export * as createPlugin from './operations/createPlugin'
export * as getPlugin from './operations/getPlugin'
export * as getDereferencedPlugin from './operations/getDereferencedPlugin'
export * as getPluginByName from './operations/getPluginByName'
export * as updatePlugin from './operations/updatePlugin'
export * as deletePlugin from './operations/deletePlugin'
export * as listPlugins from './operations/listPlugins'
export * as getPluginCode from './operations/getPluginCode'
export * as getUsage from './operations/getUsage'
export * as getMultipleUsages from './operations/getMultipleUsages'
export * as listUsageHistory from './operations/listUsageHistory'
export * as listUsageActivity from './operations/listUsageActivity'
export * as listUsageActivityDaily from './operations/listUsageActivityDaily'
export * as changeAISpendQuota from './operations/changeAISpendQuota'
export * as listActivities from './operations/listActivities'
export * as introspect from './operations/introspect'

export const apiVersion = '1.108.0'

export type ClientProps = {
  toAxiosRequest: typeof toAxiosRequest
  toApiError: typeof toApiError
}

export class Client {

  public constructor(private axiosInstance: AxiosInstance, private props: Partial<ClientProps> = {}) {}

  public readonly runVrl = async (input: runVrl.RunVrlInput): Promise<runVrl.RunVrlResponse> => {
    const { path, headers, query, body } = runVrl.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<runVrl.RunVrlResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getAccount = async (input: getAccount.GetAccountInput): Promise<getAccount.GetAccountResponse> => {
    const { path, headers, query, body } = getAccount.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getAccount.GetAccountResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateAccount = async (input: updateAccount.UpdateAccountInput): Promise<updateAccount.UpdateAccountResponse> => {
    const { path, headers, query, body } = updateAccount.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateAccount.UpdateAccountResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteAccount = async (input: deleteAccount.DeleteAccountInput): Promise<deleteAccount.DeleteAccountResponse> => {
    const { path, headers, query, body } = deleteAccount.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteAccount.DeleteAccountResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listPersonalAccessTokens = async (input: listPersonalAccessTokens.ListPersonalAccessTokensInput): Promise<listPersonalAccessTokens.ListPersonalAccessTokensResponse> => {
    const { path, headers, query, body } = listPersonalAccessTokens.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listPersonalAccessTokens.ListPersonalAccessTokensResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createPersonalAccessToken = async (input: createPersonalAccessToken.CreatePersonalAccessTokenInput): Promise<createPersonalAccessToken.CreatePersonalAccessTokenResponse> => {
    const { path, headers, query, body } = createPersonalAccessToken.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createPersonalAccessToken.CreatePersonalAccessTokenResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deletePersonalAccessToken = async (input: deletePersonalAccessToken.DeletePersonalAccessTokenInput): Promise<deletePersonalAccessToken.DeletePersonalAccessTokenResponse> => {
    const { path, headers, query, body } = deletePersonalAccessToken.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deletePersonalAccessToken.DeletePersonalAccessTokenResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setAccountPreference = async (input: setAccountPreference.SetAccountPreferenceInput): Promise<setAccountPreference.SetAccountPreferenceResponse> => {
    const { path, headers, query, body } = setAccountPreference.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setAccountPreference.SetAccountPreferenceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getAccountPreference = async (input: getAccountPreference.GetAccountPreferenceInput): Promise<getAccountPreference.GetAccountPreferenceResponse> => {
    const { path, headers, query, body } = getAccountPreference.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getAccountPreference.GetAccountPreferenceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listPublicIntegrations = async (input: listPublicIntegrations.ListPublicIntegrationsInput): Promise<listPublicIntegrations.ListPublicIntegrationsResponse> => {
    const { path, headers, query, body } = listPublicIntegrations.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listPublicIntegrations.ListPublicIntegrationsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPublicIntegrationById = async (input: getPublicIntegrationById.GetPublicIntegrationByIdInput): Promise<getPublicIntegrationById.GetPublicIntegrationByIdResponse> => {
    const { path, headers, query, body } = getPublicIntegrationById.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPublicIntegrationById.GetPublicIntegrationByIdResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPublicIntegration = async (input: getPublicIntegration.GetPublicIntegrationInput): Promise<getPublicIntegration.GetPublicIntegrationResponse> => {
    const { path, headers, query, body } = getPublicIntegration.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPublicIntegration.GetPublicIntegrationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listPublicPlugins = async (input: listPublicPlugins.ListPublicPluginsInput): Promise<listPublicPlugins.ListPublicPluginsResponse> => {
    const { path, headers, query, body } = listPublicPlugins.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listPublicPlugins.ListPublicPluginsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPublicPluginById = async (input: getPublicPluginById.GetPublicPluginByIdInput): Promise<getPublicPluginById.GetPublicPluginByIdResponse> => {
    const { path, headers, query, body } = getPublicPluginById.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPublicPluginById.GetPublicPluginByIdResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getDereferencedPublicPluginById = async (input: getDereferencedPublicPluginById.GetDereferencedPublicPluginByIdInput): Promise<getDereferencedPublicPluginById.GetDereferencedPublicPluginByIdResponse> => {
    const { path, headers, query, body } = getDereferencedPublicPluginById.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getDereferencedPublicPluginById.GetDereferencedPublicPluginByIdResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPublicPlugin = async (input: getPublicPlugin.GetPublicPluginInput): Promise<getPublicPlugin.GetPublicPluginResponse> => {
    const { path, headers, query, body } = getPublicPlugin.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPublicPlugin.GetPublicPluginResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPublicPluginCode = async (input: getPublicPluginCode.GetPublicPluginCodeInput): Promise<getPublicPluginCode.GetPublicPluginCodeResponse> => {
    const { path, headers, query, body } = getPublicPluginCode.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPublicPluginCode.GetPublicPluginCodeResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listPublicInterfaces = async (input: listPublicInterfaces.ListPublicInterfacesInput): Promise<listPublicInterfaces.ListPublicInterfacesResponse> => {
    const { path, headers, query, body } = listPublicInterfaces.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listPublicInterfaces.ListPublicInterfacesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPublicInterfaceById = async (input: getPublicInterfaceById.GetPublicInterfaceByIdInput): Promise<getPublicInterfaceById.GetPublicInterfaceByIdResponse> => {
    const { path, headers, query, body } = getPublicInterfaceById.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPublicInterfaceById.GetPublicInterfaceByIdResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPublicInterface = async (input: getPublicInterface.GetPublicInterfaceInput): Promise<getPublicInterface.GetPublicInterfaceResponse> => {
    const { path, headers, query, body } = getPublicInterface.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPublicInterface.GetPublicInterfaceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createBot = async (input: createBot.CreateBotInput): Promise<createBot.CreateBotResponse> => {
    const { path, headers, query, body } = createBot.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createBot.CreateBotResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateBot = async (input: updateBot.UpdateBotInput): Promise<updateBot.UpdateBotResponse> => {
    const { path, headers, query, body } = updateBot.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateBot.UpdateBotResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly rotateBotSigningSecrets = async (input: rotateBotSigningSecrets.RotateBotSigningSecretsInput): Promise<rotateBotSigningSecrets.RotateBotSigningSecretsResponse> => {
    const { path, headers, query, body } = rotateBotSigningSecrets.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<rotateBotSigningSecrets.RotateBotSigningSecretsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly transferBot = async (input: transferBot.TransferBotInput): Promise<transferBot.TransferBotResponse> => {
    const { path, headers, query, body } = transferBot.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<transferBot.TransferBotResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listBots = async (input: listBots.ListBotsInput): Promise<listBots.ListBotsResponse> => {
    const { path, headers, query, body } = listBots.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listBots.ListBotsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getBot = async (input: getBot.GetBotInput): Promise<getBot.GetBotResponse> => {
    const { path, headers, query, body } = getBot.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getBot.GetBotResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteBot = async (input: deleteBot.DeleteBotInput): Promise<deleteBot.DeleteBotResponse> => {
    const { path, headers, query, body } = deleteBot.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteBot.DeleteBotResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getBotLogs = async (input: getBotLogs.GetBotLogsInput): Promise<getBotLogs.GetBotLogsResponse> => {
    const { path, headers, query, body } = getBotLogs.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getBotLogs.GetBotLogsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getBotWebchat = async (input: getBotWebchat.GetBotWebchatInput): Promise<getBotWebchat.GetBotWebchatResponse> => {
    const { path, headers, query, body } = getBotWebchat.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getBotWebchat.GetBotWebchatResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getBotAnalytics = async (input: getBotAnalytics.GetBotAnalyticsInput): Promise<getBotAnalytics.GetBotAnalyticsResponse> => {
    const { path, headers, query, body } = getBotAnalytics.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getBotAnalytics.GetBotAnalyticsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listActionRuns = async (input: listActionRuns.ListActionRunsInput): Promise<listActionRuns.ListActionRunsResponse> => {
    const { path, headers, query, body } = listActionRuns.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listActionRuns.ListActionRunsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getBotIssue = async (input: getBotIssue.GetBotIssueInput): Promise<getBotIssue.GetBotIssueResponse> => {
    const { path, headers, query, body } = getBotIssue.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getBotIssue.GetBotIssueResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listBotIssues = async (input: listBotIssues.ListBotIssuesInput): Promise<listBotIssues.ListBotIssuesResponse> => {
    const { path, headers, query, body } = listBotIssues.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listBotIssues.ListBotIssuesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteBotIssue = async (input: deleteBotIssue.DeleteBotIssueInput): Promise<deleteBotIssue.DeleteBotIssueResponse> => {
    const { path, headers, query, body } = deleteBotIssue.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteBotIssue.DeleteBotIssueResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listBotIssueEvents = async (input: listBotIssueEvents.ListBotIssueEventsInput): Promise<listBotIssueEvents.ListBotIssueEventsResponse> => {
    const { path, headers, query, body } = listBotIssueEvents.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listBotIssueEvents.ListBotIssueEventsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listBotVersions = async (input: listBotVersions.ListBotVersionsInput): Promise<listBotVersions.ListBotVersionsResponse> => {
    const { path, headers, query, body } = listBotVersions.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listBotVersions.ListBotVersionsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getBotVersion = async (input: getBotVersion.GetBotVersionInput): Promise<getBotVersion.GetBotVersionResponse> => {
    const { path, headers, query, body } = getBotVersion.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getBotVersion.GetBotVersionResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getBotJson = async (input: getBotJson.GetBotJsonInput): Promise<getBotJson.GetBotJsonResponse> => {
    const { path, headers, query, body } = getBotJson.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getBotJson.GetBotJsonResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly publishFromBotJson = async (input: publishFromBotJson.PublishFromBotJsonInput): Promise<publishFromBotJson.PublishFromBotJsonResponse> => {
    const { path, headers, query, body } = publishFromBotJson.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<publishFromBotJson.PublishFromBotJsonResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createBotVersion = async (input: createBotVersion.CreateBotVersionInput): Promise<createBotVersion.CreateBotVersionResponse> => {
    const { path, headers, query, body } = createBotVersion.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createBotVersion.CreateBotVersionResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deployBotVersion = async (input: deployBotVersion.DeployBotVersionInput): Promise<deployBotVersion.DeployBotVersionResponse> => {
    const { path, headers, query, body } = deployBotVersion.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deployBotVersion.DeployBotVersionResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createIntegrationShareableId = async (input: createIntegrationShareableId.CreateIntegrationShareableIdInput): Promise<createIntegrationShareableId.CreateIntegrationShareableIdResponse> => {
    const { path, headers, query, body } = createIntegrationShareableId.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createIntegrationShareableId.CreateIntegrationShareableIdResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteIntegrationShareableId = async (input: deleteIntegrationShareableId.DeleteIntegrationShareableIdInput): Promise<deleteIntegrationShareableId.DeleteIntegrationShareableIdResponse> => {
    const { path, headers, query, body } = deleteIntegrationShareableId.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteIntegrationShareableId.DeleteIntegrationShareableIdResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getIntegrationShareableId = async (input: getIntegrationShareableId.GetIntegrationShareableIdInput): Promise<getIntegrationShareableId.GetIntegrationShareableIdResponse> => {
    const { path, headers, query, body } = getIntegrationShareableId.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getIntegrationShareableId.GetIntegrationShareableIdResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly unlinkSandboxedConversations = async (input: unlinkSandboxedConversations.UnlinkSandboxedConversationsInput): Promise<unlinkSandboxedConversations.UnlinkSandboxedConversationsResponse> => {
    const { path, headers, query, body } = unlinkSandboxedConversations.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<unlinkSandboxedConversations.UnlinkSandboxedConversationsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listBotApiKeys = async (input: listBotApiKeys.ListBotApiKeysInput): Promise<listBotApiKeys.ListBotApiKeysResponse> => {
    const { path, headers, query, body } = listBotApiKeys.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listBotApiKeys.ListBotApiKeysResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createBotApiKey = async (input: createBotApiKey.CreateBotApiKeyInput): Promise<createBotApiKey.CreateBotApiKeyResponse> => {
    const { path, headers, query, body } = createBotApiKey.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createBotApiKey.CreateBotApiKeyResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteBotApiKey = async (input: deleteBotApiKey.DeleteBotApiKeyInput): Promise<deleteBotApiKey.DeleteBotApiKeyResponse> => {
    const { path, headers, query, body } = deleteBotApiKey.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteBotApiKey.DeleteBotApiKeyResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getBotAllowlist = async (input: getBotAllowlist.GetBotAllowlistInput): Promise<getBotAllowlist.GetBotAllowlistResponse> => {
    const { path, headers, query, body } = getBotAllowlist.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getBotAllowlist.GetBotAllowlistResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateBotAllowlist = async (input: updateBotAllowlist.UpdateBotAllowlistInput): Promise<updateBotAllowlist.UpdateBotAllowlistResponse> => {
    const { path, headers, query, body } = updateBotAllowlist.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateBotAllowlist.UpdateBotAllowlistResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly migrateWorkspaceToV4 = async (input: migrateWorkspaceToV4.MigrateWorkspaceToV4Input): Promise<migrateWorkspaceToV4.MigrateWorkspaceToV4Response> => {
    const { path, headers, query, body } = migrateWorkspaceToV4.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<migrateWorkspaceToV4.MigrateWorkspaceToV4Response>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listWorkspaceInvoices = async (input: listWorkspaceInvoices.ListWorkspaceInvoicesInput): Promise<listWorkspaceInvoices.ListWorkspaceInvoicesResponse> => {
    const { path, headers, query, body } = listWorkspaceInvoices.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listWorkspaceInvoices.ListWorkspaceInvoicesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getUpcomingInvoice = async (input: getUpcomingInvoice.GetUpcomingInvoiceInput): Promise<getUpcomingInvoice.GetUpcomingInvoiceResponse> => {
    const { path, headers, query, body } = getUpcomingInvoice.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getUpcomingInvoice.GetUpcomingInvoiceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly chargeWorkspaceUnpaidInvoices = async (input: chargeWorkspaceUnpaidInvoices.ChargeWorkspaceUnpaidInvoicesInput): Promise<chargeWorkspaceUnpaidInvoices.ChargeWorkspaceUnpaidInvoicesResponse> => {
    const { path, headers, query, body } = chargeWorkspaceUnpaidInvoices.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<chargeWorkspaceUnpaidInvoices.ChargeWorkspaceUnpaidInvoicesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createWorkspace = async (input: createWorkspace.CreateWorkspaceInput): Promise<createWorkspace.CreateWorkspaceResponse> => {
    const { path, headers, query, body } = createWorkspace.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createWorkspace.CreateWorkspaceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPublicWorkspace = async (input: getPublicWorkspace.GetPublicWorkspaceInput): Promise<getPublicWorkspace.GetPublicWorkspaceResponse> => {
    const { path, headers, query, body } = getPublicWorkspace.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPublicWorkspace.GetPublicWorkspaceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getWorkspace = async (input: getWorkspace.GetWorkspaceInput): Promise<getWorkspace.GetWorkspaceResponse> => {
    const { path, headers, query, body } = getWorkspace.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getWorkspace.GetWorkspaceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listWorkspaceUsages = async (input: listWorkspaceUsages.ListWorkspaceUsagesInput): Promise<listWorkspaceUsages.ListWorkspaceUsagesResponse> => {
    const { path, headers, query, body } = listWorkspaceUsages.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listWorkspaceUsages.ListWorkspaceUsagesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly breakDownWorkspaceUsageByBot = async (input: breakDownWorkspaceUsageByBot.BreakDownWorkspaceUsageByBotInput): Promise<breakDownWorkspaceUsageByBot.BreakDownWorkspaceUsageByBotResponse> => {
    const { path, headers, query, body } = breakDownWorkspaceUsageByBot.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<breakDownWorkspaceUsageByBot.BreakDownWorkspaceUsageByBotResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getAllWorkspaceQuotaCompletion = async (input: getAllWorkspaceQuotaCompletion.GetAllWorkspaceQuotaCompletionInput): Promise<getAllWorkspaceQuotaCompletion.GetAllWorkspaceQuotaCompletionResponse> => {
    const { path, headers, query, body } = getAllWorkspaceQuotaCompletion.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getAllWorkspaceQuotaCompletion.GetAllWorkspaceQuotaCompletionResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getWorkspaceQuota = async (input: getWorkspaceQuota.GetWorkspaceQuotaInput): Promise<getWorkspaceQuota.GetWorkspaceQuotaResponse> => {
    const { path, headers, query, body } = getWorkspaceQuota.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getWorkspaceQuota.GetWorkspaceQuotaResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listWorkspaceQuotas = async (input: listWorkspaceQuotas.ListWorkspaceQuotasInput): Promise<listWorkspaceQuotas.ListWorkspaceQuotasResponse> => {
    const { path, headers, query, body } = listWorkspaceQuotas.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listWorkspaceQuotas.ListWorkspaceQuotasResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateWorkspace = async (input: updateWorkspace.UpdateWorkspaceInput): Promise<updateWorkspace.UpdateWorkspaceResponse> => {
    const { path, headers, query, body } = updateWorkspace.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateWorkspace.UpdateWorkspaceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly checkHandleAvailability = async (input: checkHandleAvailability.CheckHandleAvailabilityInput): Promise<checkHandleAvailability.CheckHandleAvailabilityResponse> => {
    const { path, headers, query, body } = checkHandleAvailability.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<checkHandleAvailability.CheckHandleAvailabilityResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listWorkspaces = async (input: listWorkspaces.ListWorkspacesInput): Promise<listWorkspaces.ListWorkspacesResponse> => {
    const { path, headers, query, body } = listWorkspaces.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listWorkspaces.ListWorkspacesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listPublicWorkspaces = async (input: listPublicWorkspaces.ListPublicWorkspacesInput): Promise<listPublicWorkspaces.ListPublicWorkspacesResponse> => {
    const { path, headers, query, body } = listPublicWorkspaces.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listPublicWorkspaces.ListPublicWorkspacesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteWorkspace = async (input: deleteWorkspace.DeleteWorkspaceInput): Promise<deleteWorkspace.DeleteWorkspaceResponse> => {
    const { path, headers, query, body } = deleteWorkspace.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteWorkspace.DeleteWorkspaceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getAuditRecords = async (input: getAuditRecords.GetAuditRecordsInput): Promise<getAuditRecords.GetAuditRecordsResponse> => {
    const { path, headers, query, body } = getAuditRecords.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getAuditRecords.GetAuditRecordsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setWorkspacePreference = async (input: setWorkspacePreference.SetWorkspacePreferenceInput): Promise<setWorkspacePreference.SetWorkspacePreferenceResponse> => {
    const { path, headers, query, body } = setWorkspacePreference.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setWorkspacePreference.SetWorkspacePreferenceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getWorkspacePreference = async (input: getWorkspacePreference.GetWorkspacePreferenceInput): Promise<getWorkspacePreference.GetWorkspacePreferenceResponse> => {
    const { path, headers, query, body } = getWorkspacePreference.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getWorkspacePreference.GetWorkspacePreferenceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listWorkspaceMembers = async (input: listWorkspaceMembers.ListWorkspaceMembersInput): Promise<listWorkspaceMembers.ListWorkspaceMembersResponse> => {
    const { path, headers, query, body } = listWorkspaceMembers.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listWorkspaceMembers.ListWorkspaceMembersResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getWorkspaceMember = async (input: getWorkspaceMember.GetWorkspaceMemberInput): Promise<getWorkspaceMember.GetWorkspaceMemberResponse> => {
    const { path, headers, query, body } = getWorkspaceMember.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getWorkspaceMember.GetWorkspaceMemberResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteWorkspaceMember = async (input: deleteWorkspaceMember.DeleteWorkspaceMemberInput): Promise<deleteWorkspaceMember.DeleteWorkspaceMemberResponse> => {
    const { path, headers, query, body } = deleteWorkspaceMember.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteWorkspaceMember.DeleteWorkspaceMemberResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createWorkspaceMember = async (input: createWorkspaceMember.CreateWorkspaceMemberInput): Promise<createWorkspaceMember.CreateWorkspaceMemberResponse> => {
    const { path, headers, query, body } = createWorkspaceMember.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createWorkspaceMember.CreateWorkspaceMemberResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateWorkspaceMember = async (input: updateWorkspaceMember.UpdateWorkspaceMemberInput): Promise<updateWorkspaceMember.UpdateWorkspaceMemberResponse> => {
    const { path, headers, query, body } = updateWorkspaceMember.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateWorkspaceMember.UpdateWorkspaceMemberResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listIntegrationApiKeys = async (input: listIntegrationApiKeys.ListIntegrationApiKeysInput): Promise<listIntegrationApiKeys.ListIntegrationApiKeysResponse> => {
    const { path, headers, query, body } = listIntegrationApiKeys.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listIntegrationApiKeys.ListIntegrationApiKeysResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createIntegrationApiKey = async (input: createIntegrationApiKey.CreateIntegrationApiKeyInput): Promise<createIntegrationApiKey.CreateIntegrationApiKeyResponse> => {
    const { path, headers, query, body } = createIntegrationApiKey.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createIntegrationApiKey.CreateIntegrationApiKeyResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteIntegrationApiKey = async (input: deleteIntegrationApiKey.DeleteIntegrationApiKeyInput): Promise<deleteIntegrationApiKey.DeleteIntegrationApiKeyResponse> => {
    const { path, headers, query, body } = deleteIntegrationApiKey.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteIntegrationApiKey.DeleteIntegrationApiKeyResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createIntegration = async (input: createIntegration.CreateIntegrationInput): Promise<createIntegration.CreateIntegrationResponse> => {
    const { path, headers, query, body } = createIntegration.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createIntegration.CreateIntegrationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly validateIntegrationCreation = async (input: validateIntegrationCreation.ValidateIntegrationCreationInput): Promise<validateIntegrationCreation.ValidateIntegrationCreationResponse> => {
    const { path, headers, query, body } = validateIntegrationCreation.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<validateIntegrationCreation.ValidateIntegrationCreationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateIntegration = async (input: updateIntegration.UpdateIntegrationInput): Promise<updateIntegration.UpdateIntegrationResponse> => {
    const { path, headers, query, body } = updateIntegration.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateIntegration.UpdateIntegrationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly rotateIntegrationSigningSecrets = async (input: rotateIntegrationSigningSecrets.RotateIntegrationSigningSecretsInput): Promise<rotateIntegrationSigningSecrets.RotateIntegrationSigningSecretsResponse> => {
    const { path, headers, query, body } = rotateIntegrationSigningSecrets.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<rotateIntegrationSigningSecrets.RotateIntegrationSigningSecretsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly validateIntegrationUpdate = async (input: validateIntegrationUpdate.ValidateIntegrationUpdateInput): Promise<validateIntegrationUpdate.ValidateIntegrationUpdateResponse> => {
    const { path, headers, query, body } = validateIntegrationUpdate.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<validateIntegrationUpdate.ValidateIntegrationUpdateResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listIntegrations = async (input: listIntegrations.ListIntegrationsInput): Promise<listIntegrations.ListIntegrationsResponse> => {
    const { path, headers, query, body } = listIntegrations.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listIntegrations.ListIntegrationsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getIntegration = async (input: getIntegration.GetIntegrationInput): Promise<getIntegration.GetIntegrationResponse> => {
    const { path, headers, query, body } = getIntegration.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getIntegration.GetIntegrationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getIntegrationLogs = async (input: getIntegrationLogs.GetIntegrationLogsInput): Promise<getIntegrationLogs.GetIntegrationLogsResponse> => {
    const { path, headers, query, body } = getIntegrationLogs.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getIntegrationLogs.GetIntegrationLogsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getIntegrationByName = async (input: getIntegrationByName.GetIntegrationByNameInput): Promise<getIntegrationByName.GetIntegrationByNameResponse> => {
    const { path, headers, query, body } = getIntegrationByName.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getIntegrationByName.GetIntegrationByNameResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteIntegration = async (input: deleteIntegration.DeleteIntegrationInput): Promise<deleteIntegration.DeleteIntegrationResponse> => {
    const { path, headers, query, body } = deleteIntegration.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteIntegration.DeleteIntegrationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly requestIntegrationVerification = async (input: requestIntegrationVerification.RequestIntegrationVerificationInput): Promise<requestIntegrationVerification.RequestIntegrationVerificationResponse> => {
    const { path, headers, query, body } = requestIntegrationVerification.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<requestIntegrationVerification.RequestIntegrationVerificationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createInterface = async (input: createInterface.CreateInterfaceInput): Promise<createInterface.CreateInterfaceResponse> => {
    const { path, headers, query, body } = createInterface.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createInterface.CreateInterfaceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getInterface = async (input: getInterface.GetInterfaceInput): Promise<getInterface.GetInterfaceResponse> => {
    const { path, headers, query, body } = getInterface.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getInterface.GetInterfaceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getInterfaceByName = async (input: getInterfaceByName.GetInterfaceByNameInput): Promise<getInterfaceByName.GetInterfaceByNameResponse> => {
    const { path, headers, query, body } = getInterfaceByName.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getInterfaceByName.GetInterfaceByNameResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateInterface = async (input: updateInterface.UpdateInterfaceInput): Promise<updateInterface.UpdateInterfaceResponse> => {
    const { path, headers, query, body } = updateInterface.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateInterface.UpdateInterfaceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteInterface = async (input: deleteInterface.DeleteInterfaceInput): Promise<deleteInterface.DeleteInterfaceResponse> => {
    const { path, headers, query, body } = deleteInterface.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteInterface.DeleteInterfaceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listInterfaces = async (input: listInterfaces.ListInterfacesInput): Promise<listInterfaces.ListInterfacesResponse> => {
    const { path, headers, query, body } = listInterfaces.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listInterfaces.ListInterfacesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createPlugin = async (input: createPlugin.CreatePluginInput): Promise<createPlugin.CreatePluginResponse> => {
    const { path, headers, query, body } = createPlugin.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createPlugin.CreatePluginResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPlugin = async (input: getPlugin.GetPluginInput): Promise<getPlugin.GetPluginResponse> => {
    const { path, headers, query, body } = getPlugin.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPlugin.GetPluginResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getDereferencedPlugin = async (input: getDereferencedPlugin.GetDereferencedPluginInput): Promise<getDereferencedPlugin.GetDereferencedPluginResponse> => {
    const { path, headers, query, body } = getDereferencedPlugin.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getDereferencedPlugin.GetDereferencedPluginResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPluginByName = async (input: getPluginByName.GetPluginByNameInput): Promise<getPluginByName.GetPluginByNameResponse> => {
    const { path, headers, query, body } = getPluginByName.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPluginByName.GetPluginByNameResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updatePlugin = async (input: updatePlugin.UpdatePluginInput): Promise<updatePlugin.UpdatePluginResponse> => {
    const { path, headers, query, body } = updatePlugin.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updatePlugin.UpdatePluginResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deletePlugin = async (input: deletePlugin.DeletePluginInput): Promise<deletePlugin.DeletePluginResponse> => {
    const { path, headers, query, body } = deletePlugin.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deletePlugin.DeletePluginResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listPlugins = async (input: listPlugins.ListPluginsInput): Promise<listPlugins.ListPluginsResponse> => {
    const { path, headers, query, body } = listPlugins.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listPlugins.ListPluginsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPluginCode = async (input: getPluginCode.GetPluginCodeInput): Promise<getPluginCode.GetPluginCodeResponse> => {
    const { path, headers, query, body } = getPluginCode.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPluginCode.GetPluginCodeResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getUsage = async (input: getUsage.GetUsageInput): Promise<getUsage.GetUsageResponse> => {
    const { path, headers, query, body } = getUsage.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getUsage.GetUsageResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getMultipleUsages = async (input: getMultipleUsages.GetMultipleUsagesInput): Promise<getMultipleUsages.GetMultipleUsagesResponse> => {
    const { path, headers, query, body } = getMultipleUsages.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getMultipleUsages.GetMultipleUsagesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listUsageHistory = async (input: listUsageHistory.ListUsageHistoryInput): Promise<listUsageHistory.ListUsageHistoryResponse> => {
    const { path, headers, query, body } = listUsageHistory.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listUsageHistory.ListUsageHistoryResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listUsageActivity = async (input: listUsageActivity.ListUsageActivityInput): Promise<listUsageActivity.ListUsageActivityResponse> => {
    const { path, headers, query, body } = listUsageActivity.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listUsageActivity.ListUsageActivityResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listUsageActivityDaily = async (input: listUsageActivityDaily.ListUsageActivityDailyInput): Promise<listUsageActivityDaily.ListUsageActivityDailyResponse> => {
    const { path, headers, query, body } = listUsageActivityDaily.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listUsageActivityDaily.ListUsageActivityDailyResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly changeAISpendQuota = async (input: changeAISpendQuota.ChangeAispendQuotaInput): Promise<changeAISpendQuota.ChangeAispendQuotaResponse> => {
    const { path, headers, query, body } = changeAISpendQuota.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<changeAISpendQuota.ChangeAispendQuotaResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listActivities = async (input: listActivities.ListActivitiesInput): Promise<listActivities.ListActivitiesResponse> => {
    const { path, headers, query, body } = listActivities.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listActivities.ListActivitiesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly introspect = async (input: introspect.IntrospectInput): Promise<introspect.IntrospectResponse> => {
    const { path, headers, query, body } = introspect.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<introspect.IntrospectResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

}

// maps axios error to api error type
function toApiError(err: unknown): Error {
  if (axios.isAxiosError(err) && err.response?.data) {
    return errorFrom(err.response.data)
  }
  return errorFrom(err)
}

