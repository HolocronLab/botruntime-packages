// this file was automatically generated, do not edit
/* eslint-disable */

import axios, { AxiosInstance } from 'axios'
import { errorFrom } from './errors'
import { toAxiosRequest } from './to-axios'
import * as createConversation from './operations/createConversation'
import * as getConversation from './operations/getConversation'
import * as listConversations from './operations/listConversations'
import * as getOrCreateConversation from './operations/getOrCreateConversation'
import * as updateConversation from './operations/updateConversation'
import * as deleteConversation from './operations/deleteConversation'
import * as listParticipants from './operations/listParticipants'
import * as addParticipant from './operations/addParticipant'
import * as getParticipant from './operations/getParticipant'
import * as removeParticipant from './operations/removeParticipant'
import * as createEvent from './operations/createEvent'
import * as getEvent from './operations/getEvent'
import * as listEvents from './operations/listEvents'
import * as cancelScheduledEvent from './operations/cancelScheduledEvent'
import * as createMessage from './operations/createMessage'
import * as getOrCreateMessage from './operations/getOrCreateMessage'
import * as getMessage from './operations/getMessage'
import * as updateMessage from './operations/updateMessage'
import * as listMessages from './operations/listMessages'
import * as deleteMessage from './operations/deleteMessage'
import * as initializeIncomingMessage from './operations/initializeIncomingMessage'
import * as importMessages from './operations/importMessages'
import * as createUser from './operations/createUser'
import * as getUser from './operations/getUser'
import * as listUsers from './operations/listUsers'
import * as getOrCreateUser from './operations/getOrCreateUser'
import * as updateUser from './operations/updateUser'
import * as deleteUser from './operations/deleteUser'
import * as setStateExpiry from './operations/setStateExpiry'
import * as getState from './operations/getState'
import * as setState from './operations/setState'
import * as getOrSetState from './operations/getOrSetState'
import * as patchState from './operations/patchState'
import * as callAction from './operations/callAction'
import * as configureIntegration from './operations/configureIntegration'
import * as createWorkflow from './operations/createWorkflow'
import * as getWorkflow from './operations/getWorkflow'
import * as updateWorkflow from './operations/updateWorkflow'
import * as deleteWorkflow from './operations/deleteWorkflow'
import * as listWorkflows from './operations/listWorkflows'
import * as getOrCreateWorkflow from './operations/getOrCreateWorkflow'
import * as listTagValues from './operations/listTagValues'
import * as trackAnalytics from './operations/trackAnalytics'
import * as captureObservation from './operations/captureObservation'
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
import * as upsertFile from './operations/upsertFile'
import * as deleteFile from './operations/deleteFile'
import * as listFiles from './operations/listFiles'
import * as getFile from './operations/getFile'
import * as updateFileMetadata from './operations/updateFileMetadata'
import * as copyFile from './operations/copyFile'
import * as searchFiles from './operations/searchFiles'
import * as listFilePassages from './operations/listFilePassages'
import * as setFilePassages from './operations/setFilePassages'
import * as listFileTags from './operations/listFileTags'
import * as listFileTagValues from './operations/listFileTagValues'
import * as createKnowledgeBase from './operations/createKnowledgeBase'
import * as deleteKnowledgeBase from './operations/deleteKnowledgeBase'
import * as updateKnowledgeBase from './operations/updateKnowledgeBase'
import * as listKnowledgeBases from './operations/listKnowledgeBases'
import * as listTables from './operations/listTables'
import * as getTable from './operations/getTable'
import * as getOrCreateTable from './operations/getOrCreateTable'
import * as createTable from './operations/createTable'
import * as duplicateTable from './operations/duplicateTable'
import * as exportTable from './operations/exportTable'
import * as getTableJobs from './operations/getTableJobs'
import * as importTable from './operations/importTable'
import * as updateTable from './operations/updateTable'
import * as renameTableColumn from './operations/renameTableColumn'
import * as deleteTable from './operations/deleteTable'
import * as getTableRow from './operations/getTableRow'
import * as findTableRows from './operations/findTableRows'
import * as createTableRows from './operations/createTableRows'
import * as deleteTableRows from './operations/deleteTableRows'
import * as updateTableRows from './operations/updateTableRows'
import * as upsertTableRows from './operations/upsertTableRows'

export * from './models'

export * as createConversation from './operations/createConversation'
export * as getConversation from './operations/getConversation'
export * as listConversations from './operations/listConversations'
export * as getOrCreateConversation from './operations/getOrCreateConversation'
export * as updateConversation from './operations/updateConversation'
export * as deleteConversation from './operations/deleteConversation'
export * as listParticipants from './operations/listParticipants'
export * as addParticipant from './operations/addParticipant'
export * as getParticipant from './operations/getParticipant'
export * as removeParticipant from './operations/removeParticipant'
export * as createEvent from './operations/createEvent'
export * as getEvent from './operations/getEvent'
export * as listEvents from './operations/listEvents'
export * as cancelScheduledEvent from './operations/cancelScheduledEvent'
export * as createMessage from './operations/createMessage'
export * as getOrCreateMessage from './operations/getOrCreateMessage'
export * as getMessage from './operations/getMessage'
export * as updateMessage from './operations/updateMessage'
export * as listMessages from './operations/listMessages'
export * as deleteMessage from './operations/deleteMessage'
export * as initializeIncomingMessage from './operations/initializeIncomingMessage'
export * as importMessages from './operations/importMessages'
export * as createUser from './operations/createUser'
export * as getUser from './operations/getUser'
export * as listUsers from './operations/listUsers'
export * as getOrCreateUser from './operations/getOrCreateUser'
export * as updateUser from './operations/updateUser'
export * as deleteUser from './operations/deleteUser'
export * as setStateExpiry from './operations/setStateExpiry'
export * as getState from './operations/getState'
export * as setState from './operations/setState'
export * as getOrSetState from './operations/getOrSetState'
export * as patchState from './operations/patchState'
export * as callAction from './operations/callAction'
export * as configureIntegration from './operations/configureIntegration'
export * as createWorkflow from './operations/createWorkflow'
export * as getWorkflow from './operations/getWorkflow'
export * as updateWorkflow from './operations/updateWorkflow'
export * as deleteWorkflow from './operations/deleteWorkflow'
export * as listWorkflows from './operations/listWorkflows'
export * as getOrCreateWorkflow from './operations/getOrCreateWorkflow'
export * as listTagValues from './operations/listTagValues'
export * as trackAnalytics from './operations/trackAnalytics'
export * as captureObservation from './operations/captureObservation'
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
export * as upsertFile from './operations/upsertFile'
export * as deleteFile from './operations/deleteFile'
export * as listFiles from './operations/listFiles'
export * as getFile from './operations/getFile'
export * as updateFileMetadata from './operations/updateFileMetadata'
export * as copyFile from './operations/copyFile'
export * as searchFiles from './operations/searchFiles'
export * as listFilePassages from './operations/listFilePassages'
export * as setFilePassages from './operations/setFilePassages'
export * as listFileTags from './operations/listFileTags'
export * as listFileTagValues from './operations/listFileTagValues'
export * as createKnowledgeBase from './operations/createKnowledgeBase'
export * as deleteKnowledgeBase from './operations/deleteKnowledgeBase'
export * as updateKnowledgeBase from './operations/updateKnowledgeBase'
export * as listKnowledgeBases from './operations/listKnowledgeBases'
export * as listTables from './operations/listTables'
export * as getTable from './operations/getTable'
export * as getOrCreateTable from './operations/getOrCreateTable'
export * as createTable from './operations/createTable'
export * as duplicateTable from './operations/duplicateTable'
export * as exportTable from './operations/exportTable'
export * as getTableJobs from './operations/getTableJobs'
export * as importTable from './operations/importTable'
export * as updateTable from './operations/updateTable'
export * as renameTableColumn from './operations/renameTableColumn'
export * as deleteTable from './operations/deleteTable'
export * as getTableRow from './operations/getTableRow'
export * as findTableRows from './operations/findTableRows'
export * as createTableRows from './operations/createTableRows'
export * as deleteTableRows from './operations/deleteTableRows'
export * as updateTableRows from './operations/updateTableRows'
export * as upsertTableRows from './operations/upsertTableRows'

export const apiVersion = '1.108.0'

export type ClientProps = {
  toAxiosRequest: typeof toAxiosRequest
  toApiError: typeof toApiError
}

export class Client {

  public constructor(private axiosInstance: AxiosInstance, private props: Partial<ClientProps> = {}) {}

  public readonly createConversation = async (input: createConversation.CreateConversationInput): Promise<createConversation.CreateConversationResponse> => {
    const { path, headers, query, body } = createConversation.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createConversation.CreateConversationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getConversation = async (input: getConversation.GetConversationInput): Promise<getConversation.GetConversationResponse> => {
    const { path, headers, query, body } = getConversation.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getConversation.GetConversationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listConversations = async (input: listConversations.ListConversationsInput): Promise<listConversations.ListConversationsResponse> => {
    const { path, headers, query, body } = listConversations.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listConversations.ListConversationsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getOrCreateConversation = async (input: getOrCreateConversation.GetOrCreateConversationInput): Promise<getOrCreateConversation.GetOrCreateConversationResponse> => {
    const { path, headers, query, body } = getOrCreateConversation.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getOrCreateConversation.GetOrCreateConversationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateConversation = async (input: updateConversation.UpdateConversationInput): Promise<updateConversation.UpdateConversationResponse> => {
    const { path, headers, query, body } = updateConversation.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateConversation.UpdateConversationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteConversation = async (input: deleteConversation.DeleteConversationInput): Promise<deleteConversation.DeleteConversationResponse> => {
    const { path, headers, query, body } = deleteConversation.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteConversation.DeleteConversationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listParticipants = async (input: listParticipants.ListParticipantsInput): Promise<listParticipants.ListParticipantsResponse> => {
    const { path, headers, query, body } = listParticipants.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listParticipants.ListParticipantsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly addParticipant = async (input: addParticipant.AddParticipantInput): Promise<addParticipant.AddParticipantResponse> => {
    const { path, headers, query, body } = addParticipant.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<addParticipant.AddParticipantResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getParticipant = async (input: getParticipant.GetParticipantInput): Promise<getParticipant.GetParticipantResponse> => {
    const { path, headers, query, body } = getParticipant.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getParticipant.GetParticipantResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly removeParticipant = async (input: removeParticipant.RemoveParticipantInput): Promise<removeParticipant.RemoveParticipantResponse> => {
    const { path, headers, query, body } = removeParticipant.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<removeParticipant.RemoveParticipantResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createEvent = async (input: createEvent.CreateEventInput): Promise<createEvent.CreateEventResponse> => {
    const { path, headers, query, body } = createEvent.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createEvent.CreateEventResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getEvent = async (input: getEvent.GetEventInput): Promise<getEvent.GetEventResponse> => {
    const { path, headers, query, body } = getEvent.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getEvent.GetEventResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listEvents = async (input: listEvents.ListEventsInput): Promise<listEvents.ListEventsResponse> => {
    const { path, headers, query, body } = listEvents.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listEvents.ListEventsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly cancelScheduledEvent = async (input: cancelScheduledEvent.CancelScheduledEventInput): Promise<cancelScheduledEvent.CancelScheduledEventResponse> => {
    const { path, headers, query, body } = cancelScheduledEvent.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<cancelScheduledEvent.CancelScheduledEventResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createMessage = async (input: createMessage.CreateMessageInput): Promise<createMessage.CreateMessageResponse> => {
    const { path, headers, query, body } = createMessage.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createMessage.CreateMessageResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getOrCreateMessage = async (input: getOrCreateMessage.GetOrCreateMessageInput): Promise<getOrCreateMessage.GetOrCreateMessageResponse> => {
    const { path, headers, query, body } = getOrCreateMessage.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getOrCreateMessage.GetOrCreateMessageResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getMessage = async (input: getMessage.GetMessageInput): Promise<getMessage.GetMessageResponse> => {
    const { path, headers, query, body } = getMessage.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getMessage.GetMessageResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateMessage = async (input: updateMessage.UpdateMessageInput): Promise<updateMessage.UpdateMessageResponse> => {
    const { path, headers, query, body } = updateMessage.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateMessage.UpdateMessageResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listMessages = async (input: listMessages.ListMessagesInput): Promise<listMessages.ListMessagesResponse> => {
    const { path, headers, query, body } = listMessages.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listMessages.ListMessagesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteMessage = async (input: deleteMessage.DeleteMessageInput): Promise<deleteMessage.DeleteMessageResponse> => {
    const { path, headers, query, body } = deleteMessage.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteMessage.DeleteMessageResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly initializeIncomingMessage = async (input: initializeIncomingMessage.InitializeIncomingMessageInput): Promise<initializeIncomingMessage.InitializeIncomingMessageResponse> => {
    const { path, headers, query, body } = initializeIncomingMessage.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<initializeIncomingMessage.InitializeIncomingMessageResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly importMessages = async (input: importMessages.ImportMessagesInput): Promise<importMessages.ImportMessagesResponse> => {
    const { path, headers, query, body } = importMessages.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<importMessages.ImportMessagesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createUser = async (input: createUser.CreateUserInput): Promise<createUser.CreateUserResponse> => {
    const { path, headers, query, body } = createUser.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createUser.CreateUserResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getUser = async (input: getUser.GetUserInput): Promise<getUser.GetUserResponse> => {
    const { path, headers, query, body } = getUser.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getUser.GetUserResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listUsers = async (input: listUsers.ListUsersInput): Promise<listUsers.ListUsersResponse> => {
    const { path, headers, query, body } = listUsers.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listUsers.ListUsersResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getOrCreateUser = async (input: getOrCreateUser.GetOrCreateUserInput): Promise<getOrCreateUser.GetOrCreateUserResponse> => {
    const { path, headers, query, body } = getOrCreateUser.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getOrCreateUser.GetOrCreateUserResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateUser = async (input: updateUser.UpdateUserInput): Promise<updateUser.UpdateUserResponse> => {
    const { path, headers, query, body } = updateUser.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateUser.UpdateUserResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteUser = async (input: deleteUser.DeleteUserInput): Promise<deleteUser.DeleteUserResponse> => {
    const { path, headers, query, body } = deleteUser.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteUser.DeleteUserResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setStateExpiry = async (input: setStateExpiry.SetStateExpiryInput): Promise<setStateExpiry.SetStateExpiryResponse> => {
    const { path, headers, query, body } = setStateExpiry.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setStateExpiry.SetStateExpiryResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getState = async (input: getState.GetStateInput): Promise<getState.GetStateResponse> => {
    const { path, headers, query, body } = getState.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getState.GetStateResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setState = async (input: setState.SetStateInput): Promise<setState.SetStateResponse> => {
    const { path, headers, query, body } = setState.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setState.SetStateResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getOrSetState = async (input: getOrSetState.GetOrSetStateInput): Promise<getOrSetState.GetOrSetStateResponse> => {
    const { path, headers, query, body } = getOrSetState.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getOrSetState.GetOrSetStateResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly patchState = async (input: patchState.PatchStateInput): Promise<patchState.PatchStateResponse> => {
    const { path, headers, query, body } = patchState.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "patch",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<patchState.PatchStateResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly callAction = async (input: callAction.CallActionInput): Promise<callAction.CallActionResponse> => {
    const { path, headers, query, body } = callAction.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<callAction.CallActionResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly configureIntegration = async (input: configureIntegration.ConfigureIntegrationInput): Promise<configureIntegration.ConfigureIntegrationResponse> => {
    const { path, headers, query, body } = configureIntegration.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<configureIntegration.ConfigureIntegrationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createWorkflow = async (input: createWorkflow.CreateWorkflowInput): Promise<createWorkflow.CreateWorkflowResponse> => {
    const { path, headers, query, body } = createWorkflow.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createWorkflow.CreateWorkflowResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getWorkflow = async (input: getWorkflow.GetWorkflowInput): Promise<getWorkflow.GetWorkflowResponse> => {
    const { path, headers, query, body } = getWorkflow.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getWorkflow.GetWorkflowResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateWorkflow = async (input: updateWorkflow.UpdateWorkflowInput): Promise<updateWorkflow.UpdateWorkflowResponse> => {
    const { path, headers, query, body } = updateWorkflow.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateWorkflow.UpdateWorkflowResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteWorkflow = async (input: deleteWorkflow.DeleteWorkflowInput): Promise<deleteWorkflow.DeleteWorkflowResponse> => {
    const { path, headers, query, body } = deleteWorkflow.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteWorkflow.DeleteWorkflowResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listWorkflows = async (input: listWorkflows.ListWorkflowsInput): Promise<listWorkflows.ListWorkflowsResponse> => {
    const { path, headers, query, body } = listWorkflows.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listWorkflows.ListWorkflowsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getOrCreateWorkflow = async (input: getOrCreateWorkflow.GetOrCreateWorkflowInput): Promise<getOrCreateWorkflow.GetOrCreateWorkflowResponse> => {
    const { path, headers, query, body } = getOrCreateWorkflow.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getOrCreateWorkflow.GetOrCreateWorkflowResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listTagValues = async (input: listTagValues.ListTagValuesInput): Promise<listTagValues.ListTagValuesResponse> => {
    const { path, headers, query, body } = listTagValues.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listTagValues.ListTagValuesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly trackAnalytics = async (input: trackAnalytics.TrackAnalyticsInput): Promise<trackAnalytics.TrackAnalyticsResponse> => {
    const { path, headers, query, body } = trackAnalytics.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<trackAnalytics.TrackAnalyticsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly captureObservation = async (input: captureObservation.CaptureObservationInput): Promise<captureObservation.CaptureObservationResponse> => {
    const { path, headers, query, body } = captureObservation.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<captureObservation.CaptureObservationResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

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

  public readonly upsertFile = async (input: upsertFile.UpsertFileInput): Promise<upsertFile.UpsertFileResponse> => {
    const { path, headers, query, body } = upsertFile.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<upsertFile.UpsertFileResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteFile = async (input: deleteFile.DeleteFileInput): Promise<deleteFile.DeleteFileResponse> => {
    const { path, headers, query, body } = deleteFile.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteFile.DeleteFileResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listFiles = async (input: listFiles.ListFilesInput): Promise<listFiles.ListFilesResponse> => {
    const { path, headers, query, body } = listFiles.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listFiles.ListFilesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getFile = async (input: getFile.GetFileInput): Promise<getFile.GetFileResponse> => {
    const { path, headers, query, body } = getFile.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getFile.GetFileResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateFileMetadata = async (input: updateFileMetadata.UpdateFileMetadataInput): Promise<updateFileMetadata.UpdateFileMetadataResponse> => {
    const { path, headers, query, body } = updateFileMetadata.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateFileMetadata.UpdateFileMetadataResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly copyFile = async (input: copyFile.CopyFileInput): Promise<copyFile.CopyFileResponse> => {
    const { path, headers, query, body } = copyFile.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<copyFile.CopyFileResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly searchFiles = async (input: searchFiles.SearchFilesInput): Promise<searchFiles.SearchFilesResponse> => {
    const { path, headers, query, body } = searchFiles.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<searchFiles.SearchFilesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listFilePassages = async (input: listFilePassages.ListFilePassagesInput): Promise<listFilePassages.ListFilePassagesResponse> => {
    const { path, headers, query, body } = listFilePassages.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listFilePassages.ListFilePassagesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setFilePassages = async (input: setFilePassages.SetFilePassagesInput): Promise<setFilePassages.SetFilePassagesResponse> => {
    const { path, headers, query, body } = setFilePassages.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setFilePassages.SetFilePassagesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listFileTags = async (input: listFileTags.ListFileTagsInput): Promise<listFileTags.ListFileTagsResponse> => {
    const { path, headers, query, body } = listFileTags.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listFileTags.ListFileTagsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listFileTagValues = async (input: listFileTagValues.ListFileTagValuesInput): Promise<listFileTagValues.ListFileTagValuesResponse> => {
    const { path, headers, query, body } = listFileTagValues.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listFileTagValues.ListFileTagValuesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createKnowledgeBase = async (input: createKnowledgeBase.CreateKnowledgeBaseInput): Promise<createKnowledgeBase.CreateKnowledgeBaseResponse> => {
    const { path, headers, query, body } = createKnowledgeBase.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createKnowledgeBase.CreateKnowledgeBaseResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteKnowledgeBase = async (input: deleteKnowledgeBase.DeleteKnowledgeBaseInput): Promise<deleteKnowledgeBase.DeleteKnowledgeBaseResponse> => {
    const { path, headers, query, body } = deleteKnowledgeBase.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteKnowledgeBase.DeleteKnowledgeBaseResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateKnowledgeBase = async (input: updateKnowledgeBase.UpdateKnowledgeBaseInput): Promise<updateKnowledgeBase.UpdateKnowledgeBaseResponse> => {
    const { path, headers, query, body } = updateKnowledgeBase.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateKnowledgeBase.UpdateKnowledgeBaseResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listKnowledgeBases = async (input: listKnowledgeBases.ListKnowledgeBasesInput): Promise<listKnowledgeBases.ListKnowledgeBasesResponse> => {
    const { path, headers, query, body } = listKnowledgeBases.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listKnowledgeBases.ListKnowledgeBasesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listTables = async (input: listTables.ListTablesInput): Promise<listTables.ListTablesResponse> => {
    const { path, headers, query, body } = listTables.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listTables.ListTablesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getTable = async (input: getTable.GetTableInput): Promise<getTable.GetTableResponse> => {
    const { path, headers, query, body } = getTable.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getTable.GetTableResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getOrCreateTable = async (input: getOrCreateTable.GetOrCreateTableInput): Promise<getOrCreateTable.GetOrCreateTableResponse> => {
    const { path, headers, query, body } = getOrCreateTable.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getOrCreateTable.GetOrCreateTableResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createTable = async (input: createTable.CreateTableInput): Promise<createTable.CreateTableResponse> => {
    const { path, headers, query, body } = createTable.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createTable.CreateTableResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly duplicateTable = async (input: duplicateTable.DuplicateTableInput): Promise<duplicateTable.DuplicateTableResponse> => {
    const { path, headers, query, body } = duplicateTable.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<duplicateTable.DuplicateTableResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly exportTable = async (input: exportTable.ExportTableInput): Promise<exportTable.ExportTableResponse> => {
    const { path, headers, query, body } = exportTable.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<exportTable.ExportTableResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getTableJobs = async (input: getTableJobs.GetTableJobsInput): Promise<getTableJobs.GetTableJobsResponse> => {
    const { path, headers, query, body } = getTableJobs.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getTableJobs.GetTableJobsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly importTable = async (input: importTable.ImportTableInput): Promise<importTable.ImportTableResponse> => {
    const { path, headers, query, body } = importTable.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<importTable.ImportTableResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateTable = async (input: updateTable.UpdateTableInput): Promise<updateTable.UpdateTableResponse> => {
    const { path, headers, query, body } = updateTable.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateTable.UpdateTableResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly renameTableColumn = async (input: renameTableColumn.RenameTableColumnInput): Promise<renameTableColumn.RenameTableColumnResponse> => {
    const { path, headers, query, body } = renameTableColumn.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<renameTableColumn.RenameTableColumnResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteTable = async (input: deleteTable.DeleteTableInput): Promise<deleteTable.DeleteTableResponse> => {
    const { path, headers, query, body } = deleteTable.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteTable.DeleteTableResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getTableRow = async (input: getTableRow.GetTableRowInput): Promise<getTableRow.GetTableRowResponse> => {
    const { path, headers, query, body } = getTableRow.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getTableRow.GetTableRowResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly findTableRows = async (input: findTableRows.FindTableRowsInput): Promise<findTableRows.FindTableRowsResponse> => {
    const { path, headers, query, body } = findTableRows.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<findTableRows.FindTableRowsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createTableRows = async (input: createTableRows.CreateTableRowsInput): Promise<createTableRows.CreateTableRowsResponse> => {
    const { path, headers, query, body } = createTableRows.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createTableRows.CreateTableRowsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteTableRows = async (input: deleteTableRows.DeleteTableRowsInput): Promise<deleteTableRows.DeleteTableRowsResponse> => {
    const { path, headers, query, body } = deleteTableRows.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteTableRows.DeleteTableRowsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateTableRows = async (input: updateTableRows.UpdateTableRowsInput): Promise<updateTableRows.UpdateTableRowsResponse> => {
    const { path, headers, query, body } = updateTableRows.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateTableRows.UpdateTableRowsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly upsertTableRows = async (input: upsertTableRows.UpsertTableRowsInput): Promise<upsertTableRows.UpsertTableRowsResponse> => {
    const { path, headers, query, body } = upsertTableRows.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<upsertTableRows.UpsertTableRowsResponse>(axiosReq)
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

