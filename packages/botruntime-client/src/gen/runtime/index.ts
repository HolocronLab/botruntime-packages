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

}

// maps axios error to api error type
function toApiError(err: unknown): Error {
  if (axios.isAxiosError(err) && err.response?.data) {
    return errorFrom(err.response.data)
  }
  return errorFrom(err)
}

