// this file was automatically generated, do not edit
/* eslint-disable */

import axios, { AxiosInstance } from 'axios'
import { errorFrom } from './errors'
import { toAxiosRequest } from './to-axios'
import * as getBillingReadonly from './operations/getBillingReadonly'
import * as getBillingAddress from './operations/getBillingAddress'
import * as setBillingAddress from './operations/setBillingAddress'
import * as getCustomer from './operations/getCustomer'
import * as setCustomer from './operations/setCustomer'
import * as getPlan from './operations/getPlan'
import * as listPlans from './operations/listPlans'
import * as getAddon from './operations/getAddon'
import * as listAddons from './operations/listAddons'
import * as getSubscription from './operations/getSubscription'
import * as previewSubscriptionUpdate from './operations/previewSubscriptionUpdate'
import * as setPlan from './operations/setPlan'
import * as setAddons from './operations/setAddons'
import * as setCancelAtPeriodEnd from './operations/setCancelAtPeriodEnd'
import * as getAutoRechargeSettings from './operations/getAutoRechargeSettings'
import * as setAutoRechargeSettings from './operations/setAutoRechargeSettings'
import * as getTrials from './operations/getTrials'
import * as createTrial from './operations/createTrial'
import * as removeTrial from './operations/removeTrial'
import * as createCreditGrant from './operations/createCreditGrant'
import * as listInvoices from './operations/listInvoices'
import * as payInvoice from './operations/payInvoice'
import * as getPaymentMethod from './operations/getPaymentMethod'
import * as setPaymentMethod from './operations/setPaymentMethod'
import * as createPaymentMethodIntent from './operations/createPaymentMethodIntent'
import * as getQuotas from './operations/getQuotas'
import * as getWorkspaceUsage from './operations/getWorkspaceUsage'
import * as getWorkspaceUsages from './operations/getWorkspaceUsages'

export * from './models'

export * as getBillingReadonly from './operations/getBillingReadonly'
export * as getBillingAddress from './operations/getBillingAddress'
export * as setBillingAddress from './operations/setBillingAddress'
export * as getCustomer from './operations/getCustomer'
export * as setCustomer from './operations/setCustomer'
export * as getPlan from './operations/getPlan'
export * as listPlans from './operations/listPlans'
export * as getAddon from './operations/getAddon'
export * as listAddons from './operations/listAddons'
export * as getSubscription from './operations/getSubscription'
export * as previewSubscriptionUpdate from './operations/previewSubscriptionUpdate'
export * as setPlan from './operations/setPlan'
export * as setAddons from './operations/setAddons'
export * as setCancelAtPeriodEnd from './operations/setCancelAtPeriodEnd'
export * as getAutoRechargeSettings from './operations/getAutoRechargeSettings'
export * as setAutoRechargeSettings from './operations/setAutoRechargeSettings'
export * as getTrials from './operations/getTrials'
export * as createTrial from './operations/createTrial'
export * as removeTrial from './operations/removeTrial'
export * as createCreditGrant from './operations/createCreditGrant'
export * as listInvoices from './operations/listInvoices'
export * as payInvoice from './operations/payInvoice'
export * as getPaymentMethod from './operations/getPaymentMethod'
export * as setPaymentMethod from './operations/setPaymentMethod'
export * as createPaymentMethodIntent from './operations/createPaymentMethodIntent'
export * as getQuotas from './operations/getQuotas'
export * as getWorkspaceUsage from './operations/getWorkspaceUsage'
export * as getWorkspaceUsages from './operations/getWorkspaceUsages'

export const apiVersion = '1.108.0'

export type ClientProps = {
  toAxiosRequest: typeof toAxiosRequest
  toApiError: typeof toApiError
}

export class Client {

  public constructor(private axiosInstance: AxiosInstance, private props: Partial<ClientProps> = {}) {}

  public readonly getBillingReadonly = async (input: getBillingReadonly.GetBillingReadonlyInput): Promise<getBillingReadonly.GetBillingReadonlyResponse> => {
    const { path, headers, query, body } = getBillingReadonly.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getBillingReadonly.GetBillingReadonlyResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getBillingAddress = async (input: getBillingAddress.GetBillingAddressInput): Promise<getBillingAddress.GetBillingAddressResponse> => {
    const { path, headers, query, body } = getBillingAddress.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getBillingAddress.GetBillingAddressResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setBillingAddress = async (input: setBillingAddress.SetBillingAddressInput): Promise<setBillingAddress.SetBillingAddressResponse> => {
    const { path, headers, query, body } = setBillingAddress.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setBillingAddress.SetBillingAddressResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getCustomer = async (input: getCustomer.GetCustomerInput): Promise<getCustomer.GetCustomerResponse> => {
    const { path, headers, query, body } = getCustomer.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getCustomer.GetCustomerResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setCustomer = async (input: setCustomer.SetCustomerInput): Promise<setCustomer.SetCustomerResponse> => {
    const { path, headers, query, body } = setCustomer.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "patch",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setCustomer.SetCustomerResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPlan = async (input: getPlan.GetPlanInput): Promise<getPlan.GetPlanResponse> => {
    const { path, headers, query, body } = getPlan.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPlan.GetPlanResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listPlans = async (input: listPlans.ListPlansInput): Promise<listPlans.ListPlansResponse> => {
    const { path, headers, query, body } = listPlans.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listPlans.ListPlansResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getAddon = async (input: getAddon.GetAddonInput): Promise<getAddon.GetAddonResponse> => {
    const { path, headers, query, body } = getAddon.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getAddon.GetAddonResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listAddons = async (input: listAddons.ListAddonsInput): Promise<listAddons.ListAddonsResponse> => {
    const { path, headers, query, body } = listAddons.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listAddons.ListAddonsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getSubscription = async (input: getSubscription.GetSubscriptionInput): Promise<getSubscription.GetSubscriptionResponse> => {
    const { path, headers, query, body } = getSubscription.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getSubscription.GetSubscriptionResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly previewSubscriptionUpdate = async (input: previewSubscriptionUpdate.PreviewSubscriptionUpdateInput): Promise<previewSubscriptionUpdate.PreviewSubscriptionUpdateResponse> => {
    const { path, headers, query, body } = previewSubscriptionUpdate.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<previewSubscriptionUpdate.PreviewSubscriptionUpdateResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setPlan = async (input: setPlan.SetPlanInput): Promise<setPlan.SetPlanResponse> => {
    const { path, headers, query, body } = setPlan.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setPlan.SetPlanResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setAddons = async (input: setAddons.SetAddonsInput): Promise<setAddons.SetAddonsResponse> => {
    const { path, headers, query, body } = setAddons.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "patch",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setAddons.SetAddonsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setCancelAtPeriodEnd = async (input: setCancelAtPeriodEnd.SetCancelAtPeriodEndInput): Promise<setCancelAtPeriodEnd.SetCancelAtPeriodEndResponse> => {
    const { path, headers, query, body } = setCancelAtPeriodEnd.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setCancelAtPeriodEnd.SetCancelAtPeriodEndResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getAutoRechargeSettings = async (input: getAutoRechargeSettings.GetAutoRechargeSettingsInput): Promise<getAutoRechargeSettings.GetAutoRechargeSettingsResponse> => {
    const { path, headers, query, body } = getAutoRechargeSettings.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getAutoRechargeSettings.GetAutoRechargeSettingsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setAutoRechargeSettings = async (input: setAutoRechargeSettings.SetAutoRechargeSettingsInput): Promise<setAutoRechargeSettings.SetAutoRechargeSettingsResponse> => {
    const { path, headers, query, body } = setAutoRechargeSettings.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setAutoRechargeSettings.SetAutoRechargeSettingsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getTrials = async (input: getTrials.GetTrialsInput): Promise<getTrials.GetTrialsResponse> => {
    const { path, headers, query, body } = getTrials.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getTrials.GetTrialsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createTrial = async (input: createTrial.CreateTrialInput): Promise<createTrial.CreateTrialResponse> => {
    const { path, headers, query, body } = createTrial.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createTrial.CreateTrialResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly removeTrial = async (input: removeTrial.RemoveTrialInput): Promise<removeTrial.RemoveTrialResponse> => {
    const { path, headers, query, body } = removeTrial.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<removeTrial.RemoveTrialResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createCreditGrant = async (input: createCreditGrant.CreateCreditGrantInput): Promise<createCreditGrant.CreateCreditGrantResponse> => {
    const { path, headers, query, body } = createCreditGrant.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createCreditGrant.CreateCreditGrantResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listInvoices = async (input: listInvoices.ListInvoicesInput): Promise<listInvoices.ListInvoicesResponse> => {
    const { path, headers, query, body } = listInvoices.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listInvoices.ListInvoicesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly payInvoice = async (input: payInvoice.PayInvoiceInput): Promise<payInvoice.PayInvoiceResponse> => {
    const { path, headers, query, body } = payInvoice.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<payInvoice.PayInvoiceResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getPaymentMethod = async (input: getPaymentMethod.GetPaymentMethodInput): Promise<getPaymentMethod.GetPaymentMethodResponse> => {
    const { path, headers, query, body } = getPaymentMethod.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getPaymentMethod.GetPaymentMethodResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setPaymentMethod = async (input: setPaymentMethod.SetPaymentMethodInput): Promise<setPaymentMethod.SetPaymentMethodResponse> => {
    const { path, headers, query, body } = setPaymentMethod.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setPaymentMethod.SetPaymentMethodResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createPaymentMethodIntent = async (input: createPaymentMethodIntent.CreatePaymentMethodIntentInput): Promise<createPaymentMethodIntent.CreatePaymentMethodIntentResponse> => {
    const { path, headers, query, body } = createPaymentMethodIntent.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createPaymentMethodIntent.CreatePaymentMethodIntentResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getQuotas = async (input: getQuotas.GetQuotasInput): Promise<getQuotas.GetQuotasResponse> => {
    const { path, headers, query, body } = getQuotas.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getQuotas.GetQuotasResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getWorkspaceUsage = async (input: getWorkspaceUsage.GetWorkspaceUsageInput): Promise<getWorkspaceUsage.GetWorkspaceUsageResponse> => {
    const { path, headers, query, body } = getWorkspaceUsage.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getWorkspaceUsage.GetWorkspaceUsageResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getWorkspaceUsages = async (input: getWorkspaceUsages.GetWorkspaceUsagesInput): Promise<getWorkspaceUsages.GetWorkspaceUsagesResponse> => {
    const { path, headers, query, body } = getWorkspaceUsages.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getWorkspaceUsages.GetWorkspaceUsagesResponse>(axiosReq)
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

