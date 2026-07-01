// this file was automatically generated, do not edit
/* eslint-disable */

import axios, { AxiosInstance } from 'axios'
import { errorFrom } from './errors'
import { toAxiosRequest } from './to-axios'
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

